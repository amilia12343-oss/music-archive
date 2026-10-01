// Experiment only. Official methods:
// https://www.last.fm/api/show/artist.getTopTracks
// https://www.last.fm/api/show/artist.getSimilar
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { seeds, normalize, releaseCategory } from './recommendation-test.mjs';
import { keyOf } from './cochart-recommendation-test.mjs';

const ERA = { startMonth: '2016-01', endMonth: '2018-12' };
const BUDGET = { topTracksPerArtist: 30, relatedArtistsPerSeed: 3,
  metadataPerSeedPerChannel: 5, lastfmStartIntervalMs: 300, itunesStartIntervalMs: 3100 };
const label = ({ title, artist }) => `${artist} - ${title}`;
const artistKey = (artist) => keyOf({ title: '__artist_identity__', artist });
const array = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const SHOWN_FILES = [
  'results/hybrid/hybrid-recommendation-2016-2018.json',
  'results/hybrid/hybrid-round2-2016-2018.json',
  'results/cochart/cochart-round3-2016-2018.json',
  'results/cochart/cochart-v2-2016-2018.json',
  'results/cochart/cochart-v3-time-balanced-2016-2018.json',
];

export function loadInputs() {
  const shownResults = SHOWN_FILES.map(read);
  const circle = read('data/circle/circle-chart-2016-2018.json');
  const baseline = read('results/lastfm/recommendation-fallback-output.json');
  for (const input of [...shownResults, circle, baseline]) {
    assert.deepEqual(input.era, ERA, 'Input Era must be 2016-01 through 2018-12');
  }
  assert(shownResults.every((result) => result.candidates?.length === 30));
  assert(Array.isArray(circle.tracks));
  return { shownResults, circle, baseline };
}

async function getJson(url, fetchFn) {
  // URLs and raw fetch errors may contain API credentials; never expose them.
  let response;
  try { response = await fetchFn(url, { signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('Network failure or 20-second timeout'); }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  try { return await response.json(); }
  catch { throw new Error('Invalid JSON response'); }
}

export function createApi(apiKey, { fetchFn = fetch, wait = sleep } = {}) {
  const topCache = new Map();
  let lastfmStart = 0;
  let itunesStart = 0;
  const requests = { lastfm: 0, itunes: 0 };
  async function lastfm(method, artist, limit) {
    assert(['artist.getTopTracks', 'artist.getSimilar'].includes(method));
    await wait(Math.max(0, lastfmStart - Date.now()));
    lastfmStart = Date.now() + BUDGET.lastfmStartIntervalMs;
    const params = new URLSearchParams({ method, artist, limit: String(limit),
      autocorrect: '1', api_key: apiKey, format: 'json' });
    requests.lastfm++;
    const data = await getJson(`https://ws.audioscrobbler.com/2.0/?${params}`, fetchFn);
    if (data?.error) throw new Error(`Last.fm error ${Number(data.error)}`);
    return data;
  }
  async function topTracks(artist) {
    // Cache raw-name requests, including errors; no pagination or retry requests.
    const key = normalize(artist);
    if (!topCache.has(key)) topCache.set(key, (async () => {
      const data = await lastfm('artist.getTopTracks', artist, BUDGET.topTracksPerArtist);
      if (!data?.toptracks) throw new Error('Missing toptracks response');
      const canonicalArtist = data.toptracks['@attr']?.artist ?? artist;
      // Autocorrection is diagnostic; do not silently accept an unrelated artist.
      if (artistKey(canonicalArtist) !== artistKey(artist)) {
        throw new Error('Autocorrected artist differs from requested experiment identity');
      }
      const tracks = array(data.toptracks.track).slice(0, BUDGET.topTracksPerArtist)
        .map((item, index) => ({ title: item?.name,
          artist: typeof item?.artist === 'string' ? item.artist : item?.artist?.name,
          topTrackRank: Number(item?.['@attr']?.rank) || index + 1 }))
        .filter((song) => typeof song.title === 'string' && song.title.trim()
          && typeof song.artist === 'string' && song.artist.trim()
          && artistKey(song.artist) === artistKey(artist)
          && Number.isInteger(song.topTrackRank) && song.topTrackRank > 0)
        .sort((a, b) => a.topTrackRank - b.topTrackRank);
      return { canonicalArtist, tracks };
    })());
    return topCache.get(key);
  }
  async function similarArtists(artist) {
    const data = await lastfm('artist.getSimilar', artist, BUDGET.relatedArtistsPerSeed);
    if (!data?.similarartists) throw new Error('Missing similarartists response');
    const canonicalArtist = data.similarartists['@attr']?.artist ?? artist;
    if (artistKey(canonicalArtist) !== artistKey(artist)) {
      throw new Error('Autocorrected artist differs from requested experiment identity');
    }
    return { canonicalArtist, artists: array(data.similarartists.artist)
      .map((item) => ({ artist: item?.name, match: Number(item?.match) }))
      .filter((item) => typeof item.artist === 'string' && item.artist.trim()
        && Number.isFinite(item.match) && item.match >= 0
        && artistKey(item.artist) !== artistKey(artist))
      .sort((a, b) => b.match - a.match).slice(0, BUDGET.relatedArtistsPerSeed) };
  }
  async function metadata(song) {
    await wait(Math.max(0, itunesStart - Date.now()));
    itunesStart = Date.now() + BUDGET.itunesStartIntervalMs;
    requests.itunes++;
    const params = new URLSearchParams({ term: `${song.artist} ${song.title}`,
      media: 'music', entity: 'song', limit: '25' });
    const data = await getJson(`https://itunes.apple.com/search?${params}`, fetchFn);
    if (!Array.isArray(data?.results)) throw new Error('Missing iTunes results');
    // Same conservative normalized matching as recommendation-test.mjs.
    // Translation/alias mismatches stay Unknown, rather than guessing a date.
    const matches = data.results.filter((item) => item?.kind === 'song'
      && typeof item.trackName === 'string' && typeof item.artistName === 'string'
      && normalize(item.trackName) === normalize(song.title)
      && normalize(item.artistName) === normalize(song.artist));
    const dates = matches.map((item) => item.releaseDate)
      .filter((date) => releaseCategory(date) !== 'Unknown').sort();
    return { releaseDate: dates[0]?.slice(0, 10) ?? null, itunesMatches: matches.length,
      matching: !matches.length ? 'No exact title/artist match; possible translation/alias/catalog gap'
        : !dates.length ? 'Matched; date unavailable' : 'Exact normalized match; earliest observed catalog date' };
  }
  return { topTracks, similarArtists, metadata, requests };
}

export async function runExperiment({ shownResults, circle, baseline }, api) {
  assert.equal(seeds.length, 12);
  const original = new Set(seeds.map(keyOf));
  const shown = new Set(shownResults.flatMap((result) => result.candidates).map(keyOf));
  const selected = new Set();
  const metadataCache = new Map();
  const finalCandidates = [];
  const counters = { futureExcludedCount: 0, originalSeedExcluded: 0,
    previouslyShownExcluded: 0, semanticDuplicateSkipped: 0 };
  const sameArtistReports = [];
  const relatedArtistReports = [];
  async function choose(tracks, report, provenance) {
    for (const song of tracks) {
      const key = keyOf(song);
      let rejected;
      if (original.has(key)) { counters.originalSeedExcluded++; rejected = 'Original Seed'; }
      else if (shown.has(key)) { counters.previouslyShownExcluded++; rejected = 'Previously shown'; }
      else if (selected.has(key)) { counters.semanticDuplicateSkipped++; rejected = 'Selected semantic duplicate'; }
      if (rejected) { report.skipped.push({ title: song.title, artist: song.artist, reason: rejected }); continue; }
      if (!metadataCache.has(key)) {
        if (report.metadataRequests >= BUDGET.metadataPerSeedPerChannel) {
          report.metadataBudgetReached = true;
          return null;
        }
        report.metadataRequests++;
        let metadata;
        try { metadata = await api.metadata(song); }
        catch (error) { metadata = { releaseDate: null, matching: `iTunes failed: ${error.message}` }; }
        metadataCache.set(key, metadata);
      }
      const metadata = metadataCache.get(key);
      const category = releaseCategory(metadata.releaseDate);
      if (category === 'Future') {
        counters.futureExcludedCount++;
        report.skipped.push({ title: song.title, artist: song.artist, reason: 'Known Future catalog date', ...metadata });
        continue;
      }
      const candidate = { rank: finalCandidates.length + 1, title: song.title, artist: song.artist,
        ...provenance, ...metadata, category: category === 'Era-period' ? 'Era' : category,
        ...(provenance.source === 'SAME_ARTIST' ? { artistTopTrackRank: song.topTrackRank }
          : { relatedArtistTopTrackRank: song.topTrackRank }) };
      selected.add(key);
      finalCandidates.push(candidate);
      report.success = true;
      report.candidate = candidate;
      return candidate;
    }
    return null;
  }
  const makeReport = (seed) => ({ seed, success: false, candidate: null, failureReason: null,
    metadataRequests: 0, metadataBudgetReached: false, skipped: [], errors: [] });
  // Reserve SAME_ARTIST choices first; RELATED_ARTIST cannot steal their identities.
  for (const seed of seeds) {
    const report = makeReport(seed);
    try {
      const { tracks, canonicalArtist } = await api.topTracks(seed.artist);
      report.canonicalArtist = canonicalArtist;
      report.rawTrackCount = tracks.length;
      await choose(tracks, report, { source: 'SAME_ARTIST', sourceSeedTitle: seed.title, sourceSeedArtist: seed.artist });
      if (!report.success) report.failureReason = report.metadataBudgetReached
        ? 'Metadata lookup budget reached; coverage not exhaustively searched' : 'No eligible track within top-track lookup window';
    } catch (error) { report.failureReason = error.message; }
    sameArtistReports.push(report);
  }
  for (const seed of seeds) {
    const report = makeReport(seed);
    report.relatedArtistsTried = [];
    try {
      const { artists, canonicalArtist } = await api.similarArtists(seed.artist);
      report.canonicalArtist = canonicalArtist;
      for (const related of artists) {
        report.relatedArtistsTried.push(related);
        try {
          const { tracks } = await api.topTracks(related.artist);
          await choose(tracks, report, { source: 'RELATED_ARTIST', sourceSeedTitle: seed.title,
            sourceSeedArtist: seed.artist, relatedArtist: related.artist, relatedArtistMatch: related.match });
        } catch (error) { report.errors.push({ artist: related.artist, reason: error.message }); }
        if (report.success || report.metadataBudgetReached) break;
      }
      if (!report.success) report.failureReason = report.metadataBudgetReached
        ? 'Metadata lookup budget reached; coverage not exhaustively searched' : 'No eligible track within similar-artist/top-track lookup windows';
    } catch (error) { report.failureReason = error.message; }
    relatedArtistReports.push(report);
  }
  // Circle is read only after ALL selections. Its information cannot affect ranking.
  const circleMonths = new Map();
  for (const row of circle.tracks) {
    const key = keyOf(row);
    if (!circleMonths.has(key)) circleMonths.set(key, new Set());
    for (const { period } of row.chartHistory) {
      if (period >= ERA.startMonth && period <= ERA.endMonth) circleMonths.get(key).add(period);
    }
  }
  for (const song of finalCandidates) {
    song.circleMonthsOnChart = circleMonths.get(keyOf(song))?.size ?? 0;
    song.inEraCircleChart = song.circleMonthsOnChart > 0;
  }
  assert(finalCandidates.length <= 24);
  assert.equal(new Set(finalCandidates.map(keyOf)).size, finalCandidates.length);
  assert(finalCandidates.every((song) => !original.has(keyOf(song)) && !shown.has(keyOf(song))
    && releaseCategory(song.releaseDate) !== 'Future'));
  for (const source of ['SAME_ARTIST', 'RELATED_ARTIST']) {
    const songs = finalCandidates.filter((song) => song.source === source);
    assert(songs.length <= 12);
    assert.equal(new Set(songs.map((song) => keyOf({ title: song.sourceSeedTitle, artist: song.sourceSeedArtist }))).size, songs.length);
    assert(songs.every((song) => original.has(keyOf({ title: song.sourceSeedTitle, artist: song.sourceSeedArtist }))));
    assert(songs.every((song) => source === 'SAME_ARTIST'
      ? song.artistTopTrackRank > 0 && artistKey(song.artist) === artistKey(song.sourceSeedArtist)
      : song.relatedArtistTopTrackRank > 0 && Number.isFinite(song.relatedArtistMatch)
        && artistKey(song.artist) === artistKey(song.relatedArtist)));
  }
  const successes = (reports) => reports.filter((report) => report.success).length;
  const same = successes(sameArtistReports), related = successes(relatedArtistReports);
  const artistLabels = new Set([...sameArtistReports, ...relatedArtistReports].filter((r) => r.success).map((r) => label(r.seed)));
  const priorFailed = new Set(baseline.failedSeeds ?? []);
  return { experiment: 'Personal Recall v1', executionStatus: 'completed', era: ERA, anchors: seeds,
    policy: 'Original 12 high-intent Seeds only. SAME_ARTIST top-track rank; RELATED_ARTIST match DESC then top-track rank ASC. No weighted score, chart ranking, feedback Anchors or quota refill.',
    budget: BUDGET, requestCounts: api.requests ?? null, shownInputFiles: SHOWN_FILES,
    diagnostics: { releaseCaveat: 'iTunes dates are earliest observed exact-match catalog listings, not original-release ground truth. Reissues can wrongly exclude older songs as Future; translation/alias misses remain Unknown.',
      countMeaning: 'Exclusion counters count attempted candidate rows across channels, not distinct identities.',
      coverageCaveat: 'Bounded lookup windows, metadata availability and previous-shown exclusions affect success; this is not a full-catalog coverage measure.' },
    summary: { totalSeeds: 12, sameArtistSeedSuccess: same, sameArtistSeedFailure: 12 - same,
      relatedArtistSeedSuccess: related, relatedArtistSeedFailure: 12 - related,
      sameArtistCandidateCount: same, relatedArtistCandidateCount: related, finalCandidateCount: finalCandidates.length,
      shortfall: 24 - finalCandidates.length,
      olderCount: finalCandidates.filter((s) => s.category === 'Older').length,
      eraCount: finalCandidates.filter((s) => s.category === 'Era').length,
      unknownCount: finalCandidates.filter((s) => s.category === 'Unknown').length,
      inEraCircleCount: finalCandidates.filter((s) => s.inEraCircleChart).length,
      offEraCircleCount: finalCandidates.filter((s) => !s.inEraCircleChart).length,
      olderAndOffCircleCount: finalCandidates.filter((s) => s.category === 'Older' && !s.inEraCircleChart).length,
      ...counters,
      coverageComparison: { previousTrackGetSimilarSuccess: baseline.seedSummary?.finalSuccess ?? null,
        artistLevelEitherChannelSuccess: artistLabels.size,
        previousFailedSeedsNowSuccessful: [...artistLabels].filter((name) => priorFailed.has(name)),
        caveat: 'Saved track-level baseline vs current artist-level eligible-candidate coverage; API availability, time and exclusions differ.' } },
    validation: { onlyOriginalSeeds: true, feedbackAnchorsUsed: 0, originalSeedReappearances: 0,
      previouslyShownReappearances: 0, finalSemanticDuplicates: 0, knownFutureCandidates: 0,
      maximumOnePerSeedPerChannel: true, circleUsedOnlyAfterSelection: true },
    sameArtistReports, relatedArtistReports, finalCandidates };
}

export async function main() {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) throw new Error('Set LASTFM_API_KEY in the process environment. No result was generated.');
  console.log('Personal Recall v1: original 12 Seeds; maximum 24 candidates. Sequential API requests; completion may take several minutes.');
  console.log(`Lookup window: top ${BUDGET.topTracksPerArtist} tracks; ${BUDGET.relatedArtistsPerSeed} related artists; at most ${BUDGET.metadataPerSeedPerChannel} new metadata requests per Seed/channel. No pagination or quota refill.`);
  const output = await runExperiment(loadInputs(), createApi(apiKey));
  mkdirSync(new URL('../results/personal-recall/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../results/personal-recall/personal-recall-v1-2016-2018.json', import.meta.url), JSON.stringify(output, null, 2), 'utf8');
  console.log(JSON.stringify(output.summary, null, 2));
  for (const [index, seed] of seeds.entries()) {
    console.log(`\nSeed: ${label(seed)}`);
    for (const [channel, report] of [['SAME_ARTIST', output.sameArtistReports[index]], ['RELATED_ARTIST', output.relatedArtistReports[index]]]) {
      console.log(`${channel}: ${report.success ? label(report.candidate) : `FAILED: ${report.failureReason}`}`);
      if (report.candidate?.relatedArtist) console.log(`related artist=${report.candidate.relatedArtist}; match=${report.candidate.relatedArtistMatch}`);
    }
  }
  console.log('\nFinal candidates:');
  for (const song of output.finalCandidates) console.log(`${song.rank}. ${song.title} - ${song.artist} [${song.source}; ${song.category}; Circle=${song.inEraCircleChart}]`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
