// Offline v3: v2 global calculations below are retained; only time-balanced selection is added.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { seeds } from './recommendation-test.mjs';
import { keyOf } from './cochart-recommendation-test.mjs';
import { validateFeedback } from './hybrid-round2-test.mjs';

const ERA = { startMonth: '2016-01', endMonth: '2018-12' };
const label = ({ title, artist }) => `${artist} - ${title}`;
const STRONG_THRESHOLD = 0.30; // Experiment baseline, not a product rule.
export const compareCandidates = (a, b) => b.strongSeedCount - a.strongSeedCount
  || b.jaccardSum - a.jaccardSum
  || b.jaccardAverage - a.jaccardAverage
  || b.matchedSeedCount - a.matchedSeedCount
  || b.rankWeightedScore - a.rankWeightedScore
  || a.discoveryOrder - b.discoveryOrder;

export function buildCochartV3(circle, round1, feedback, round2, v1, v2) {
  for (const input of [circle, round1, feedback, round2, v1, v2]) {
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
    const candidateChartMonths = [...track.months.keys()].sort();
    const candidateMonthsOnChart = candidateChartMonths.length;
    let jaccardSum = 0;
    let seedRecallSum = 0;
    let strongSeedCount = 0;
    let rankWeightedScore = 0;
    for (const report of matched.values()) {
      const months = report.chartMonths.filter((period) => track.months.has(period));
      if (!months.length) continue;
      const denominator = report.monthsOnChart + candidateMonthsOnChart - months.length;
      const pairJaccard = denominator === 0 ? 0 : months.length / denominator;
      const pairSeedRecall = report.monthsOnChart === 0 ? 0 : months.length / report.monthsOnChart;
      matchedSeeds.push({ seed: report.seed, sharedMonthCount: months.length,
        seedMonthsOnChart: report.monthsOnChart, candidateMonthsOnChart,
        pairJaccard, pairSeedRecall, sharedMonths: months });
      jaccardSum += pairJaccard;
      seedRecallSum += pairSeedRecall;
      if (pairJaccard >= STRONG_THRESHOLD) strongSeedCount++;
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
      coMonthCount: sharedMonths.length, candidateMonthsOnChart, candidateChartMonths,
      strongSeedCount, jaccardSum, jaccardAverage: jaccardSum / matchedSeeds.length,
      seedRecallSum, rankWeightedScore,
      matchedSeeds, sharedMonths, discoveryOrder: track.discoveryOrder });
  }
  const eligible = pool.filter((song) => !excluded.has(song.identity)).sort(compareCandidates);

  // Recompute v2's unchanged TOP 30 in memory, without writing its result file.
  const globalTop30 = eligible.slice(0, 30).map(({ identity, discoveryOrder, ...song }, index) => ({ rank: index + 1, ...song }));
  assert.deepEqual(globalTop30, v2.candidates, 'Global metrics / ranking must match saved v2 exactly');
  for (const field of ['totalPositiveSeeds', 'matchedCircleSeeds', 'unmatchedCircleSeeds', 'totalCandidatePool', 'eligibleCandidatePool']) {
    const actual = { totalPositiveSeeds: positiveSeeds.length,
      matchedCircleSeeds: reports.filter((report) => report.matched).length,
      unmatchedCircleSeeds: reports.filter((report) => !report.matched).length,
      totalCandidatePool: pool.length, eligibleCandidatePool: eligible.length };
    assert.equal(actual[field], v2.summary[field], `Same v2 pool and seeds: ${field}`);
  }
  assert.equal(positiveSeeds.length, 26, 'Use only the 26 Round 1 positive seeds');
  assert.equal(new Set(positiveSeeds.map(keyOf)).size, 26);
  const positiveLabels = new Set(positiveSeeds.map(label));
  for (const song of eligible) {
    assert(song.matchedSeeds.length > 0);
    assert(song.matchedSeeds.every((pair) => positiveLabels.has(pair.seed)));
    assert(song.matchedSeeds.every((pair) => pair.pairJaccard >= 0 && pair.pairJaccard <= 1));
    assert.equal(song.jaccardSum, song.matchedSeeds.reduce((sum, pair) => sum + pair.pairJaccard, 0));
    assert.equal(song.strongSeedCount, song.matchedSeeds.filter((pair) => pair.pairJaccard >= STRONG_THRESHOLD).length);
  }

  const segmentDefinitions = [2016, 2017, 2018].flatMap((year) => [
    { segment: `${year}-H1`, startMonth: `${year}-01`, endMonth: `${year}-06` },
    { segment: `${year}-H2`, startMonth: `${year}-07`, endMonth: `${year}-12` },
  ]);
  const candidates = [];
  const selected = new Set();
  const segments = [];
  for (const definition of segmentDefinitions) {
    const within = (month) => month >= definition.startMonth && month <= definition.endMonth;
    const ranked = eligible.filter((song) => song.candidateChartMonths.some(within))
      .map((song) => ({ ...song, ...segmentMetrics(song, reports, within) }))
      .sort(compareSegmentCandidates);
    assert(ranked.every((song, index) => !index || compareSegmentCandidates(ranked[index - 1], song) <= 0));
    const available = ranked.filter((song) => !selected.has(song.identity));
    const chosen = available.slice(0, 5);
    const selectedTracks = [];
    for (const [index, song] of chosen.entries()) {
      const { identity, discoveryOrder, ...details } = song;
      assert(!excluded.has(identity) && !selected.has(identity));
      assert(song.candidateChartMonths.some(within));
      selected.add(identity);
      const candidate = { finalRank: candidates.length + 1, segment: definition.segment,
        segmentRank: index + 1, ...details };
      candidates.push(candidate);
      selectedTracks.push({ finalRank: candidate.finalRank, segmentRank: candidate.segmentRank,
        title: candidate.title, artist: candidate.artist });
    }
    segments.push({ ...definition, eligibleCandidates: ranked.length,
      availableAfterEarlierSelections: available.length, selectedCount: chosen.length,
      shortfall: 5 - chosen.length, selectedTracks });
  }
  assert.equal(new Set(candidates.map(keyOf)).size, candidates.length, 'No semantic duplicate');
  assert(candidates.every((song) => !excluded.has(keyOf(song))), 'No original Seed or R1/R2 shown track');
  const shortfalls = segments.filter((segment) => segment.shortfall > 0);
  // A genuine small pool is reported; it never triggers a fabricated fallback.
  if (!shortfalls.length) assert.equal(candidates.length, 30);
  const distribution = Object.fromEntries(segments.map(({ segment, selectedCount }) => [segment, selectedCount]));
  for (const segment of segments) {
    assert.equal(candidates.filter((song) => song.segment === segment.segment).length, segment.selectedCount);
  }
  const v2Keys = new Set(v2.candidates.map(keyOf));
  const finalKeys = new Set(candidates.map(keyOf));
  const describe = ({ title, artist }) => ({ title, artist });
  const newTracks = candidates.filter((song) => !v2Keys.has(keyOf(song))).map(describe);
  const removedTracks = v2.candidates.filter((song) => !finalKeys.has(keyOf(song))).map(describe);
  return { era: ERA, source: 'circle', experiment: 'co-chart v3 / time-balanced selection',
    policy: 'Same v2 global metrics, threshold, positive seeds, semantic pool and exclusions. Six chronological segments, five tracks each; no API calls, release-date filter or fallback.',
    strongSeedThreshold: STRONG_THRESHOLD,
    segmentSortOrder: ['segmentStrongSeedCount DESC', 'segmentJaccardSum DESC',
      'segmentJaccardAverage DESC', 'segmentMatchedSeedCount DESC',
      'segmentRankWeightedScore DESC', 'Circle semantic first discovery ASC'],
    summary: { totalPositiveSeeds: positiveSeeds.length,
      matchedCircleSeeds: reports.filter((report) => report.matched).length,
      unmatchedCircleSeeds: reports.filter((report) => !report.matched).length,
      totalCandidatePool: pool.length, eligibleCandidatePool: eligible.length,
      finalCandidateCount: candidates.length, duplicateSkipCount, excludedPreviouslyShownCount,
      segmentDistribution: distribution,
      comparison: { overlapWithV2Top30: candidates.filter((song) => v2Keys.has(keyOf(song))).length,
        newComparedToV2Top30: newTracks.length, removedFromV2Top30: removedTracks.length,
        newTracks, removedTracks },
      shortfallReason: shortfalls.length ? shortfalls.map((s) => `${s.segment}: ${s.shortfall} missing`).join('; ') : null },
    validation: { globalTop30ExactlyMatchesSavedV2: true, sameV2PoolAndSeedCounts: true,
      originalSeedReappearances: 0, round1ShownReappearances: 0, round2ShownReappearances: 0,
      finalSemanticDuplicates: 0, onlyRound1PositiveSeeds: true,
      globalAndSegmentJaccardWithinRange: true, strongSeedCountsMatch: true,
      segmentLexicographicSortMatches: true, allSegmentsHaveFive: !shortfalls.length },
    seedReports: reports, segments, candidates };
}

export const compareSegmentCandidates = (a, b) => b.segmentStrongSeedCount - a.segmentStrongSeedCount
  || b.segmentJaccardSum - a.segmentJaccardSum
  || b.segmentJaccardAverage - a.segmentJaccardAverage
  || b.segmentMatchedSeedCount - a.segmentMatchedSeedCount
  || b.segmentRankWeightedScore - a.segmentRankWeightedScore
  || a.discoveryOrder - b.discoveryOrder;

function segmentMetrics(song, reports, within) {
  const candidateMonths = song.candidateChartMonths.filter(within);
  const pairs = [];
  let segmentRankWeightedScore = 0;
  for (const report of reports.filter((report) => report.matched)) {
    const seedMonths = report.chartMonths.filter(within);
    const sharedMonths = seedMonths.filter((month) => candidateMonths.includes(month));
    if (!sharedMonths.length) continue;
    const denominator = seedMonths.length + candidateMonths.length - sharedMonths.length;
    const segmentPairJaccard = denominator === 0 ? 0 : sharedMonths.length / denominator;
    assert(segmentPairJaccard >= 0 && segmentPairJaccard <= 1);
    pairs.push({ seed: report.seed, segmentSharedMonthCount: sharedMonths.length,
      segmentSeedMonths: seedMonths.length, segmentCandidateMonths: candidateMonths.length,
      segmentPairJaccard, sharedMonths });
    for (const month of sharedMonths) {
      const evidence = song.sharedMonths.find((entry) => entry.seed === report.seed && entry.period === month);
      assert(evidence, 'Every segment overlap must have actual global chart evidence');
      segmentRankWeightedScore += (101 - evidence.rank) / 100;
    }
  }
  const segmentJaccardSum = pairs.reduce((sum, pair) => sum + pair.segmentPairJaccard, 0);
  const segmentStrongSeedCount = pairs.filter((pair) => pair.segmentPairJaccard >= STRONG_THRESHOLD).length;
  const result = { segmentMatchedSeedCount: pairs.length, segmentStrongSeedCount,
    segmentCoMonthCount: pairs.reduce((sum, pair) => sum + pair.segmentSharedMonthCount, 0),
    segmentJaccardSum, segmentJaccardAverage: pairs.length ? segmentJaccardSum / pairs.length : 0,
    segmentRankWeightedScore, segmentMatchedSeeds: pairs };
  assert.equal(result.segmentStrongSeedCount, pairs.filter((pair) => pair.segmentPairJaccard >= 0.30).length);
  return result;
}

export function main() {
  const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
  const output = buildCochartV3(read('data/circle/circle-chart-2016-2018.json'),
    read('results/hybrid/hybrid-recommendation-2016-2018.json'), read('data/hybrid/hybrid-round1-feedback.json'),
    read('results/hybrid/hybrid-round2-2016-2018.json'), read('results/cochart/cochart-round3-2016-2018.json'),
    read('results/cochart/cochart-v2-2016-2018.json'));
  mkdirSync(new URL('../results/cochart/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../results/cochart/cochart-v3-time-balanced-2016-2018.json', import.meta.url), JSON.stringify(output, null, 2), 'utf8');
  console.log(JSON.stringify({ summary: output.summary, validation: output.validation }, null, 2));
  for (const segment of output.segments) {
    console.log(`\n${segment.segment}: ${segment.selectedCount}/5`);
    for (const song of segment.selectedTracks) console.log(`${song.finalRank}. ${song.title} - ${song.artist}`);
  }
  for (const [heading, tracks] of [['Removed from v2 TOP 30', output.summary.comparison.removedTracks],
    ['New in v3 TOP 30', output.summary.comparison.newTracks]]) {
    console.log(`\n${heading}:`);
    for (const song of tracks) console.log(`${song.title} - ${song.artist}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
