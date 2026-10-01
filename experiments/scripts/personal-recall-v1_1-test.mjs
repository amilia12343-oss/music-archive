// Experiment only: v1 generation/ranking remains unchanged; cleanup and release verification only.
// https://musicbrainz.org/doc/MusicBrainz_API/Search
// https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { seeds, normalize } from './recommendation-test.mjs';
import { keyOf } from './cochart-recommendation-test.mjs';
import { createApi as createV1Api, loadInputs as loadV1Inputs } from './personal-recall-v1-test.mjs';

const ERA = { startMonth: '2016-01', endMonth: '2018-12' };
const BUDGET = { topTracksPerArtist: 30, relatedArtistsPerSeed: 3,
  metadataPerSeedPerChannel: 5, lastfmStartIntervalMs: 300, itunesStartIntervalMs: 3100,
  musicBrainzStartIntervalMs: 1100, musicBrainzSearchLimit: 5 };
const label = ({ title, artist }) => `${artist} - ${title}`;
const artistKey = (artist) => keyOf({ title: '__artist_identity__', artist });
const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const SHOWN_FILES = [
  'results/hybrid/hybrid-recommendation-2016-2018.json',
  'results/hybrid/hybrid-round2-2016-2018.json',
  'results/cochart/cochart-round3-2016-2018.json',
  'results/cochart/cochart-v2-2016-2018.json',
  'results/cochart/cochart-v3-time-balanced-2016-2018.json',
];

export function isMediaArtifact(title) {
  return /(?:^|[\s([\]-])(?:m\s*\/\s*v|mv|official\s+(?:mv|music\s+video|video)|lyrics\s+video|teaser)(?=$|[\s)\]!:.-])/iu.test(title)
    || /(?:\(\s*sub\s+(?:kor|eng)\b|\[\s*sub\b)/iu.test(title);
}

const descriptor = /^(?:live)(?:$|\s+(?:at|from|in|on)\b)|^(?:remix|edit|remaster(?:ed)?|acoustic|instrumental|radio\s+edit|version|mix)(?:$|\s)|\b(?:remix|edit|remaster(?:ed)?|acoustic|instrumental|version|mix)$/iu;
const creditDescriptor = /^(?:feat\.?|featuring)\s|^prod\b.*\bfeat\.?/iu;
export function normalizedBase(title) {
  let base = title.normalize('NFKC').trim();
  // Keep ordinary parenthetical subtitles, translations and unrelated words.
  base = base.replace(/\(([^()]*)\)|\[([^\[\]]*)\]/gu, (full, paren, square) => {
    const text = (paren ?? square).trim();
    return descriptor.test(text) || creditDescriptor.test(text) ? ' ' : full;
  });
  // A separated suffix explicitly ending in a version descriptor (e.g. Sam Feldt Edit).
  base = base.replace(/\s+[-–—]\s+[^\n]*\b(?:remix|edit|remaster(?:ed)?|live|acoustic|instrumental|version|mix)\s*$/iu, '');
  base = base.replace(/\s+(?:feat\.?|featuring)\s+.*$/iu, '');
  return normalize(base);
}

export function isSameRecordingVariant(song, seed, source) {
  return source === 'SAME_ARTIST' && artistKey(song.artist) === artistKey(seed.artist)
    && normalizedBase(song.title) !== '' && normalizedBase(song.title) === normalizedBase(seed.title);
}

// MusicBrainz can return YYYY, YYYY-MM or YYYY-MM-DD; retain precision instead of inventing a day.
export function dateInfo(value) {
  if (typeof value !== 'string' || !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999 || (month !== undefined && (month < 1 || month > 12))) return null;
  if (day !== undefined) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  }
  return { value, precision: day !== undefined ? 'day' : month !== undefined ? 'month' : 'year',
    earliestMonth: `${String(year).padStart(4, '0')}-${String(month ?? 1).padStart(2, '0')}`,
    latestMonth: `${String(year).padStart(4, '0')}-${String(month ?? 12).padStart(2, '0')}` };
}
export function classifyDate(value) {
  const info = dateInfo(value);
  if (!info) return 'Unknown';
  if (info.earliestMonth > ERA.endMonth) return 'Future';
  if (info.latestMonth < ERA.startMonth) return 'Older';
  return 'Era';
}
const releaseCategory = (value) => classifyDate(value) === 'Era' ? 'Era-period' : classifyDate(value);

export function matchMusicBrainz(song, recordings) {
  const matches = recordings.filter((recording) => {
    if (typeof recording?.title !== 'string' || !Array.isArray(recording['artist-credit'])) return false;
    // Compare the entire credit, never just the first artist of a collaboration.
    const credit = recording['artist-credit'];
    if (!credit.length || credit.some((part) => typeof part?.artist?.name !== 'string')) return false;
    const names = [credit.map((part) => (part.name ?? part.artist.name) + (part.joinphrase ?? '')).join(''),
      credit.map((part) => part.artist.name + (part.joinphrase ?? '')).join('')];
    return names.some((artist) => keyOf({ title: recording.title, artist }) === keyOf(song));
  });
  const dated = matches.filter((recording) => dateInfo(recording['first-release-date']))
    .sort((a, b) => a['first-release-date'].localeCompare(b['first-release-date']));
  return { musicBrainzFirstReleaseDate: dated[0]?.['first-release-date'] ?? null,
    musicBrainzRecordingMbid: (dated[0] ?? matches[0])?.id ?? null,
    musicBrainzMatches: matches.map((recording) => ({ recordingMbid: recording.id ?? null,
      title: recording.title, firstReleaseDate: recording['first-release-date'] ?? null,
      datePrecision: dateInfo(recording['first-release-date'])?.precision ?? null })),
    musicBrainzMatching: !matches.length ? 'MUSICBRAINZ_NO_EXACT_MATCH'
      : !dated.length ? 'MUSICBRAINZ_EXACT_MATCH_DATE_UNKNOWN' : 'MUSICBRAINZ_SEMANTIC_EXACT_MATCH' };
}

export function decideRelease(itunes, mb) {
  const itunesReleaseDate = dateInfo(itunes.releaseDate)?.value ?? null;
  const musicBrainzFirstReleaseDate = dateInfo(mb.musicBrainzFirstReleaseDate)?.value ?? null;
  const iCategory = classifyDate(itunesReleaseDate), mbCategory = classifyDate(musicBrainzFirstReleaseDate);
  let effectiveReleaseDate = itunesReleaseDate;
  let decision = 'ITUNES_ELIGIBLE';
  if (iCategory === 'Unknown') {
    effectiveReleaseDate = musicBrainzFirstReleaseDate;
    decision = mbCategory === 'Unknown' ? 'STILL_UNKNOWN'
      : mbCategory === 'Future' ? 'FUTURE_CAUGHT_BY_MUSICBRAINZ' : 'UNKNOWN_RESOLVED_BY_MUSICBRAINZ';
  } else if (iCategory === 'Future') {
    if (mbCategory !== 'Unknown' && mbCategory !== 'Future') {
      effectiveReleaseDate = musicBrainzFirstReleaseDate;
      decision = 'RESCUED_BY_MUSICBRAINZ';
    } else decision = mbCategory === 'Future' ? 'FUTURE_CONFIRMED_BY_MUSICBRAINZ' : 'ITUNES_FUTURE_UNCONFIRMED_BY_MB';
  }
  return { ...itunes, ...mb, itunesReleaseDate, musicBrainzFirstReleaseDate, effectiveReleaseDate,
    effectiveDatePrecision: dateInfo(effectiveReleaseDate)?.precision ?? null,
    releaseDate: effectiveReleaseDate,
    releaseEvidence: itunesReleaseDate && musicBrainzFirstReleaseDate ? 'BOTH'
      : itunesReleaseDate ? 'ITUNES' : musicBrainzFirstReleaseDate ? 'MUSICBRAINZ' : 'NONE',
    category: classifyDate(effectiveReleaseDate), releaseDecision: decision };
}

export function createApi(apiKey, { fetchFn = fetch, wait = sleep } = {}) {
  const api = createV1Api(apiKey, { fetchFn, wait });
  let nextStart = 0;
  let queue = Promise.resolve();
  api.requests.musicBrainz = 0;
  async function lookup(song) {
    await wait(Math.max(0, nextStart - Date.now()));
    nextStart = Date.now() + BUDGET.musicBrainzStartIntervalMs;
    const escape = (text) => text.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/gu, '\\$&');
    const params = new URLSearchParams({ query: `recording:"${escape(song.title)}" AND artist:"${escape(song.artist)}"`,
      fmt: 'json', limit: String(BUDGET.musicBrainzSearchLimit) });
    api.requests.musicBrainz++;
    let response;
    try {
      response = await fetchFn(`https://musicbrainz.org/ws/2/recording/?${params}`, {
        headers: { Accept: 'application/json',
          'User-Agent': 'MusicArchiveRecommendationExperiment/0.1 (+https://github.com/amilia12343-oss/music-archive)' },
        signal: AbortSignal.timeout(20000) });
    } catch { throw new Error('MusicBrainz network failure or 20-second timeout'); }
    if (!response.ok) throw new Error(`MusicBrainz HTTP ${response.status}`);
    let data;
    try { data = await response.json(); } catch { throw new Error('MusicBrainz invalid JSON response'); }
    if (!Array.isArray(data.recordings)) throw new Error('MusicBrainz missing recordings response');
    return matchMusicBrainz(song, data.recordings);
  }
  const originalMetadata = api.metadata;
  api.metadata = async (song) => {
    let itunes;
    try { itunes = await originalMetadata(song); }
    catch (error) { itunes = { releaseDate: null, matching: `iTunes failed: ${error.message}` }; }
    let mb = { musicBrainzFirstReleaseDate: null, musicBrainzRecordingMbid: null,
      musicBrainzMatches: [], musicBrainzMatching: 'MUSICBRAINZ_NOT_NEEDED' };
    if (['Future', 'Unknown'].includes(classifyDate(itunes.releaseDate))) {
      // Serialize even when called concurrently; no retry or additional lookup.
      const request = queue.then(() => lookup(song));
      queue = request.catch(() => {});
      try { mb = await request; }
      catch (error) { mb.musicBrainzMatching = 'MUSICBRAINZ_LOOKUP_FAILED'; mb.musicBrainzError = error.message; }
    }
    return decideRelease(itunes, mb);
  };
  return api;
}

export async function runExperiment({ shownResults, circle, baseline, v1Result }, api) {
  assert.equal(seeds.length, 12);
  const original = new Set(seeds.map(keyOf));
  const shown = new Set(shownResults.flatMap((result) => result.candidates).map(keyOf));
  const selected = new Set();
  const metadataCache = new Map();
  const finalCandidates = [];
  const counters = { futureExcludedCount: 0, originalSeedExcluded: 0,
    previouslyShownExcluded: 0, semanticDuplicateSkipped: 0, mediaArtifactsSkipped: 0, sameRecordingVariantsSkipped: 0 };
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
      const seed = { title: provenance.sourceSeedTitle, artist: provenance.sourceSeedArtist };
      let cleanupReason;
      if (isMediaArtifact(song.title)) { counters.mediaArtifactsSkipped++; cleanupReason = 'MEDIA_ARTIFACT'; }
      else if (isSameRecordingVariant(song, seed, provenance.source)) {
        counters.sameRecordingVariantsSkipped++; cleanupReason = 'SAME_RECORDING_VARIANT';
      }
      if (cleanupReason) {
        report.skipped.push({ title: song.title, artist: song.artist, reason: cleanupReason });
        continue;
      }
      if (!metadataCache.has(key)) {
        if (report.metadataRequests >= BUDGET.metadataPerSeedPerChannel) {
          report.metadataBudgetReached = true;
          return null;
        }
        report.metadataRequests++;
        let metadata;
        try { metadata = await api.metadata(song); }
        catch (error) { metadata = decideRelease({ releaseDate: null, matching: `Metadata failed: ${error.message}` }, { musicBrainzMatching: 'MUSICBRAINZ_LOOKUP_FAILED' }); }
        metadataCache.set(key, metadata);
      }
      const metadata = metadataCache.get(key);
      report.evaluations.push({ title: song.title, artist: song.artist, ...metadata });
      const category = releaseCategory(metadata.effectiveReleaseDate);
      if (category === 'Future') {
        counters.futureExcludedCount++;
        report.skipped.push({ title: song.title, artist: song.artist, reason: 'FUTURE_RELEASE', ...metadata });
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
    metadataRequests: 0, metadataBudgetReached: false, skipped: [], evaluations: [], errors: [] });
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
  assert(finalCandidates.every((song) => !isMediaArtifact(song.title)
    && !isSameRecordingVariant(song, { title: song.sourceSeedTitle, artist: song.sourceSeedArtist }, song.source)));
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
  const comparison = compareV1(v1Result, finalCandidates, [...sameArtistReports, ...relatedArtistReports], metadataCache);
  return { experiment: 'Personal Recall v1.1', executionStatus: 'completed', era: ERA, anchors: seeds,
    policy: 'Original 12 high-intent Seeds only. SAME_ARTIST top-track rank; RELATED_ARTIST match DESC then top-track rank ASC. No weighted score, chart ranking, feedback Anchors or quota refill.',
    budget: BUDGET, requestCounts: api.requests ?? null, comparison, shownInputFiles: SHOWN_FILES,
    diagnostics: { releaseCaveat: 'iTunes dates are earliest observed exact-match catalog listings, not original-release ground truth. MusicBrainz exact matching can rescue catalog-date conflicts or resolve Unknown; dates remain evidence, not guaranteed original releases. Partial MB dates retain precision. Title/credit mismatches remain Unknown.',
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
      maximumOnePerSeedPerChannel: true, circleUsedOnlyAfterSelection: true, musicBrainzUsedOnlyForVerification: true, finalMediaArtifacts: 0, finalSameRecordingVariants: 0 },
    sameArtistReports, relatedArtistReports, finalCandidates };
}


function compareV1(v1, candidates, reports, metadataCache) {
  assert.deepEqual(v1.era, ERA);
  assert.deepEqual(v1.anchors, seeds, 'Saved v1 must use identical original anchors');
  const oldKeys = new Set(v1.finalCandidates.map(keyOf));
  const newKeys = new Set(candidates.map(keyOf));
  const channelKey = (song) => `${song.source}:${keyOf({ title: song.sourceSeedTitle, artist: song.sourceSeedArtist })}`;
  const changes = v1.finalCandidates.filter((song) => !newKeys.has(keyOf(song))).map((song) => {
    const report = reports.find((report) => keyOf(report.seed) === keyOf({ title: song.sourceSeedTitle, artist: song.sourceSeedArtist })
      && (song.source === 'SAME_ARTIST' ? !report.relatedArtistsTried : !!report.relatedArtistsTried));
    const skipped = report?.skipped.find((entry) => keyOf(entry) === keyOf(song));
    return { v1Candidate: song, reason: skipped?.reason ?? 'NOT_RESELECTED_IN_BOUNDED_SEARCH',
      releaseDiagnostic: metadataCache.get(keyOf(song)) ?? null,
      replacement: candidates.find((entry) => channelKey(entry) === channelKey(song)) ?? null,
      channelFailureReason: report?.failureReason ?? null };
  });
  const v1UnknownDiagnostics = v1.finalCandidates.filter((song) => song.category === 'Unknown').map((song) => {
    const metadata = metadataCache.get(keyOf(song));
    const rejection = reports.flatMap((report) => report.skipped).find((entry) => keyOf(entry) === keyOf(song));
    return { title: song.title, artist: song.artist,
      status: metadata?.releaseDecision ?? rejection?.reason ?? 'NOT_REEVALUATED_IN_BOUNDED_SEARCH',
      metadata: metadata ?? null };
  });
  const allEvidence = [...metadataCache].map(([identity, metadata]) => ({ identity, ...metadata }));
  return { overlapWithV1: candidates.filter((song) => oldKeys.has(keyOf(song))).length,
    replacedFromV1: v1.finalCandidates.filter((song) => !newKeys.has(keyOf(song))).length,
    newComparedToV1: candidates.filter((song) => !oldKeys.has(keyOf(song))).length,
    v1UnknownCount: v1.finalCandidates.filter((song) => song.category === 'Unknown').length,
    v1_1UnknownCount: candidates.filter((song) => song.category === 'Unknown').length,
    v1UnknownResolvedByMusicBrainz: v1UnknownDiagnostics.filter((row) => row.metadata?.musicBrainzFirstReleaseDate
      && row.metadata.category !== 'Unknown').length,
    unknownResolvedByMusicBrainz: allEvidence.filter((row) => !row.itunesReleaseDate && row.musicBrainzFirstReleaseDate).length,
    futureCaughtByMusicBrainz: allEvidence.filter((row) => row.releaseDecision === 'FUTURE_CAUGHT_BY_MUSICBRAINZ').length,
    rescuedFromItunesFuture: allEvidence.filter((row) => row.releaseDecision === 'RESCUED_BY_MUSICBRAINZ').length,
    stillUnknown: candidates.filter((song) => song.category === 'Unknown').length,
    mediaArtifactsSkipped: reports.flatMap((report) => report.skipped).filter((row) => row.reason === 'MEDIA_ARTIFACT').length,
    sameRecordingVariantsSkipped: reports.flatMap((report) => report.skipped).filter((row) => row.reason === 'SAME_RECORDING_VARIANT').length,
    countMeaning: 'Metadata improvement counts are distinct evaluated semantic tracks, including rejected tracks; stillUnknown is final candidates. v1 Unknown tracks not encountered are reported separately, never assumed resolved.',
    v1UnknownDiagnostics, changes,
    metadataEvidence: allEvidence,
    blindEvaluationCaveat: 'Unknown dates and conservative exact-match gaps remain unverified. Inspect diagnostics before treating the set as Era-valid; metadata validation alone does not establish personal listening.' };
}

export async function main() {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) throw new Error('Set LASTFM_API_KEY in the process environment. No result was generated.');
  const inputs = { ...loadV1Inputs(), v1Result: read('results/personal-recall/personal-recall-v1-2016-2018.json') };
  console.log('Personal Recall v1.1: unchanged v1 generation/ranking and lookup budget; media/variant filters and MusicBrainz release verification added. Sequential requests may take several minutes.');
  const output = await runExperiment(inputs, createApi(apiKey));
  mkdirSync(new URL('../results/personal-recall/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../results/personal-recall/personal-recall-v1_1-2016-2018.json', import.meta.url), JSON.stringify(output, null, 2), 'utf8');
  console.log(JSON.stringify({ summary: output.summary, comparison: {
    overlapWithV1: output.comparison.overlapWithV1,
    replacedFromV1: output.comparison.replacedFromV1,
    newComparedToV1: output.comparison.newComparedToV1,
    v1UnknownCount: output.comparison.v1UnknownCount,
    v1_1UnknownCount: output.comparison.v1_1UnknownCount,
    v1UnknownResolvedByMusicBrainz: output.comparison.v1UnknownResolvedByMusicBrainz,
    unknownResolvedByMusicBrainz: output.comparison.unknownResolvedByMusicBrainz,
    futureCaughtByMusicBrainz: output.comparison.futureCaughtByMusicBrainz,
    rescuedFromItunesFuture: output.comparison.rescuedFromItunesFuture,
  } }, null, 2));
  for (const [index, seed] of seeds.entries()) {
    console.log(`\nSeed: ${label(seed)}`);
    for (const [channel, report] of [['SAME_ARTIST', output.sameArtistReports[index]], ['RELATED_ARTIST', output.relatedArtistReports[index]]]) {
      console.log(`${channel}: ${report.success ? label(report.candidate) : `FAILED: ${report.failureReason}`}`);
    }
  }
  for (const change of output.comparison.changes) {
    console.log(`\nv1 ${label(change.v1Candidate)} -> ${change.reason} -> ${change.replacement ? label(change.replacement) : 'No replacement'}`);
  }
  console.log('\nFinal candidates:');
  for (const song of output.finalCandidates) {
    console.log(`${song.rank}. ${song.title} - ${song.artist} [${song.source}; ${song.category}; evidence=${song.releaseEvidence}; date=${song.effectiveReleaseDate ?? 'Unknown'}]`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
