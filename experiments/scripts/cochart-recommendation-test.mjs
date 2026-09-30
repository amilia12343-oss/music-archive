// Offline historical context experiment. Imports reuse identities only; no API calls.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { seeds } from './recommendation-test.mjs';
import { keyOf as existingKeyOf, validateFeedback } from './hybrid-round2-test.mjs';

// Two observed cross-source variants only; leave all other experiment identities intact.
const additionalAliases = new Map([
  [existingKeyOf({ title: 'Beautiful', artist: 'Wanna One (워너원)' }),
    existingKeyOf({ title: 'Beautiful', artist: 'Wanna One' })],
  [existingKeyOf({ title: 'There`s Nothing Holdin` Me Back', artist: 'Shawn Mendes' }),
    existingKeyOf({ title: "There's Nothing Holdin' Me Back", artist: 'Shawn Mendes' })],
]);
export const keyOf = (song) => additionalAliases.get(existingKeyOf(song)) ?? existingKeyOf(song);

const ERA = { startMonth: '2016-01', endMonth: '2018-12' };
const label = ({ title, artist }) => `${artist} - ${title}`;
export const compareCandidates = (a, b) => b.matchedSeedCount - a.matchedSeedCount
  || b.normalizedOverlapScore - a.normalizedOverlapScore
  || b.coMonthCount - a.coMonthCount
  || b.rankWeightedScore - a.rankWeightedScore
  || a.discoveryOrder - b.discoveryOrder;

export function buildCochart(circle, round1, feedback, round2) {
  for (const input of [circle, round1, feedback, round2]) {
    if (input.era?.startMonth !== ERA.startMonth || input.era?.endMonth !== ERA.endMonth) {
      throw new Error('All inputs must cover 2016-01 through 2018-12');
    }
  }
  if (!Array.isArray(circle.tracks) || round2.candidates?.length !== 30) throw new Error('Missing Circle tracks or 30 Round 2 candidates');
  const positiveSeeds = validateFeedback(round1, feedback);
  const semanticTracks = new Map();
  let duplicateSkipCount = 0;
  for (const row of circle.tracks) {
    const key = keyOf(row);
    let track = semanticTracks.get(key);
    if (!track) {
      track = { title: row.title, artist: row.artist, ids: new Set(), titles: new Set(),
        months: new Map(), discoveryOrder: semanticTracks.size };
      semanticTracks.set(key, track);
    } else duplicateSkipCount++;
    if (row.sourceTrackId != null && String(row.sourceTrackId).trim()) track.ids.add(String(row.sourceTrackId));
    track.titles.add(row.title);
    if (!Array.isArray(row.chartHistory)) throw new Error('Missing chartHistory');
    for (const { period, rank } of row.chartHistory) {
      if (period < ERA.startMonth || period > ERA.endMonth) continue;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !Number.isInteger(rank) || rank < 1 || rank > 100) {
        throw new Error('Invalid Circle month or TOP 100 rank');
      }
      // Merge semantic duplicates, retaining exactly one best rank per month.
      track.months.set(period, Math.min(track.months.get(period) ?? Infinity, rank));
    }
  }
  const reports = positiveSeeds.map((seed) => {
    const match = semanticTracks.get(keyOf(seed));
    const chartMonths = match ? [...match.months.keys()].sort() : [];
    return { seed: label(seed), matched: chartMonths.length > 0,
      matchedCircleTitles: match ? [...match.titles] : [],
      sourceTrackIds: match ? [...match.ids] : [], monthsOnChart: chartMonths.length, chartMonths };
  });
  // Positive identities are counted once even if feedback happens to contain aliases.
  const matched = new Map();
  positiveSeeds.forEach((seed, index) => {
    if (reports[index].matched && !matched.has(keyOf(seed))) matched.set(keyOf(seed), reports[index]);
  });
  const previouslyShown = new Set([...round1.candidates, ...round2.candidates].map(keyOf));
  const excluded = new Set([...seeds.map(keyOf), ...previouslyShown]);
  const pool = [];
  let excludedPreviouslyShownCount = 0;
  for (const [key, track] of semanticTracks) {
    const matchedSeeds = [];
    const sharedMonths = [];
    let normalizedOverlapScore = 0;
    let rankWeightedScore = 0;
    for (const report of matched.values()) {
      const months = report.chartMonths.filter((period) => track.months.has(period));
      if (!months.length) continue;
      matchedSeeds.push({ seed: report.seed, sharedMonthCount: months.length,
        seedMonthsOnChart: report.monthsOnChart, sharedMonths: months });
      normalizedOverlapScore += months.length / report.monthsOnChart;
      for (const period of months) {
        const rank = track.months.get(period);
        sharedMonths.push({ seed: report.seed, period, rank });
        rankWeightedScore += (101 - rank) / 100;
      }
    }
    if (!matchedSeeds.length) continue;
    if (previouslyShown.has(key)) excludedPreviouslyShownCount++;
    pool.push({ identity: key, title: track.title, artist: track.artist,
      sourceTrackIds: [...track.ids], matchedSeedCount: matchedSeeds.length,
      coMonthCount: sharedMonths.length, normalizedOverlapScore, rankWeightedScore,
      matchedSeeds, sharedMonths, discoveryOrder: track.discoveryOrder });
  }
  const eligible = pool.filter((song) => !excluded.has(song.identity)).sort(compareCandidates);
  const candidates = eligible.slice(0, 30).map(({ identity, discoveryOrder, ...song }, index) => ({ rank: index + 1, ...song }));
  if (new Set(candidates.map(keyOf)).size !== candidates.length
    || candidates.some((song) => excluded.has(keyOf(song)))) throw new Error('Exclusion or semantic uniqueness invariant failed');
  return { era: ERA, source: 'circle', experiment: 'historical context / co-chart memory reconstruction',
    policy: 'Existing explicit aliases; monthly best rank per semantic track. No release-date filtering or external APIs. Rank-weighted score counts each distinct seed/month overlap.',
    sortOrder: ['matchedSeedCount DESC', 'normalizedOverlapScore DESC', 'coMonthCount DESC', 'rankWeightedScore DESC', 'Circle semantic first discovery ASC'],
    summary: { totalPositiveSeeds: positiveSeeds.length,
      matchedCircleSeeds: reports.filter((report) => report.matched).length,
      unmatchedCircleSeeds: reports.filter((report) => !report.matched).length,
      totalCandidatePool: pool.length, eligibleCandidatePool: eligible.length,
      finalCandidateCount: candidates.length, duplicateSkipCount, excludedPreviouslyShownCount,
      countDefinitions: { totalCandidatePool: 'Semantic co-chart tracks before all exclusions',
        duplicateSkipCount: 'Additional Circle rows merged into an existing semantic identity',
        excludedPreviouslyShownCount: 'Distinct co-chart identities excluded because shown in Round 1 or Round 2' },
      shortfallReason: candidates.length < 30
        ? `Only ${eligible.length} semantic co-chart candidates remain after exclusions; no fallback used.` : null },
    seedReports: reports, candidates };
}

export function main() {
  const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
  const output = buildCochart(read('data/circle/circle-chart-2016-2018.json'),
    read('results/hybrid/hybrid-recommendation-2016-2018.json'), read('data/hybrid/hybrid-round1-feedback.json'),
    read('results/hybrid/hybrid-round2-2016-2018.json'));
  mkdirSync(new URL('../results/cochart/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../results/cochart/cochart-round3-2016-2018.json', import.meta.url), JSON.stringify(output, null, 2), 'utf8');
  console.log(`Matched Circle Seeds: ${output.summary.matchedCircleSeeds}/${output.summary.totalPositiveSeeds}`);
  if (output.summary.shortfallReason) console.log(output.summary.shortfallReason);
  for (const song of output.candidates) {
    console.log(`${song.rank}. ${song.title} - ${song.artist}\n   matchedSeeds=${song.matchedSeedCount} / coMonths=${song.coMonthCount} / overlap=${song.normalizedOverlapScore.toFixed(4)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
