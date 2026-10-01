// Experiment only: v1 generation/ranking remains unchanged; cleanup and release verification only.
// https://musicbrainz.org/doc/MusicBrainz_API/Search
// https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
import assert from 'node:assert/strict';
import { createApi as createV12Api } from './personal-recall-v1_2-test.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { seeds, normalize } from './recommendation-test.mjs';
import { keyOf } from './cochart-recommendation-test.mjs';
import { loadInputs as loadV1Inputs } from './personal-recall-v1-test.mjs';

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
const creditDescriptor = /^(?:(?:feat\.?|ft\.?|featuring)\s|prod(?:\.|uced\s+by|\b))/iu;
export function normalizedBase(title) {
  let base = title.normalize('NFKC').trim();
  // Keep ordinary parenthetical subtitles, translations and unrelated words.
  base = base.replace(/\(([^()]*)\)|\[([^\[\]]*)\]/gu, (full, paren, square) => {
    const text = (paren ?? square).trim();
    return descriptor.test(text) || creditDescriptor.test(text) ? ' ' : full;
  });
  // A separated suffix explicitly ending in a version descriptor (e.g. Sam Feldt Edit).
  base = base.replace(/\s+[-–—]\s+[^\n]*\b(?:remix|edit|remaster(?:ed)?|live|acoustic|instrumental|version|mix)\s*$/iu, '');
  base = base.replace(/\s+(?:[-–—]\s*)?(?:feat\.?|ft\.?|featuring|prod\.|produced\s+by)\s+.*$/iu, '');
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


export function artistTerms(artist) {
  const parts = [artist, artist.replace(/\([^()]*\)/gu, ' ').trim(),
    ...[...artist.matchAll(/\(([^()]*)\)/gu)].map((match) => match[1])];
  return [...new Set(parts.map(normalize).filter(Boolean))].slice(0, 3);
}

export function resolveArtist(artist, results) {
  const terms = artistTerms(artist);
  const diagnostics = results.map((item) => ({ mbid: item.id ?? null, canonicalName: item.name ?? null,
    aliases: (item.aliases ?? []).map((alias) => alias.name).filter((name) => typeof name === 'string'),
    score: item.score ?? null }));
  const exact = diagnostics.filter((item) => item.mbid && typeof item.canonicalName === 'string'
    && [item.canonicalName, ...item.aliases].some((name) => terms.includes(normalize(name))));
  const distinct = new Map(exact.map((item) => [item.mbid, item]));
  if (distinct.size !== 1) return { resolved: false, diagnostic: 'ARTIST_NOT_RESOLVED',
    reason: distinct.size > 1 ? 'Ambiguous exact artist names/aliases; score is not identity proof' : 'No exact name/alias match',
    searchTerms: terms, results: diagnostics };
  const match = [...distinct.values()][0];
  return { resolved: true, ...match, aliasMatched: !terms.includes(normalize(match.canonicalName)),
    searchTerms: terms, results: diagnostics };
}

export function matchArtistRecording(song, recordings, artist, strict = false) {
  const matches = recordings.filter((r) => typeof r.title === 'string'
    && (strict ? keyOf({ title: r.title, artist: song.artist }) === keyOf(song)
      : normalize(r.title) === normalize(song.title) || normalizedBase(r.title) === normalizedBase(song.title))
    && Array.isArray(r['artist-credit']) && r['artist-credit'].length === 1
    && r['artist-credit'][0]?.artist?.id === artist.mbid);
  // Delegate date handling to the unchanged semantic matcher after identity is proven by MBID.
  const evidence = matchMusicBrainz(song, matches.map((r) => ({ ...r, title: song.title,
    'artist-credit': [{ name: song.artist, artist: { name: song.artist } }] })));
  evidence.musicBrainzMatches = evidence.musicBrainzMatches.map((match) => ({ ...match,
    title: matches.find((r) => r.id === match.recordingMbid)?.title ?? match.title }));
  return evidence;
}


export function createApi(apiKey, { fetchFn = fetch, wait = sleep } = {}) {
  const events = [];
  const nextStarts = new Map();
  let retryCount = 0;
  let wireAttempts = 0;
  async function metadataFetch(url, options) {
    const host = new URL(url).hostname;
    if (!['itunes.apple.com', 'musicbrainz.org'].includes(host)) return fetchFn(url, options);
    const provider = host === 'itunes.apple.com' ? 'ITUNES' : 'MUSICBRAINZ';
    const interval = provider === 'ITUNES' ? BUDGET.itunesStartIntervalMs : BUDGET.musicBrainzStartIntervalMs;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) { retryCount++; await wait(1000 * 2 ** (attempt - 1)); }
      await wait(Math.max(0, (nextStarts.get(host) ?? 0) - Date.now()));
      nextStarts.set(host, Date.now() + interval);
      wireAttempts++;
      let response;
      let retryable = true;
      let failure;
      try {
        // Each retry gets a fresh timeout; never reuse an already-aborted signal.
        response = await fetchFn(url, { ...options, signal: AbortSignal.timeout(20000) });
        if (response.ok) return response;
        retryable = response.status === 429 || response.status >= 500;
        failure = { provider, type: 'HTTP_ERROR', status: response.status };
        // Honor Retry-After when present, without exposing request URLs or keys.
        const retryAfter = response.headers?.get?.('retry-after');
        const seconds = retryAfter == null ? NaN : Number(retryAfter);
        const date = Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds * 1000) : Date.parse(retryAfter);
        if (Number.isFinite(date)) nextStarts.set(host, Math.max(nextStarts.get(host), date));
        // Release the response body before retrying or rejecting.
        try { await response.body?.cancel?.(); } catch {}
      } catch (error) {
        failure = { provider, type: ['TimeoutError', 'AbortError'].includes(error.name) ? 'TIMEOUT' : 'NETWORK_ERROR' };
      }
      const exhausted = !retryable || attempt === 2;
      events.push({ ...failure, attempt: attempt + 1, exhausted });
      if (exhausted) throw new Error(`${provider} METADATA_LOOKUP_FAILED (${failure.type}${failure.status ? ` ${failure.status}` : ''})`);
    }
  }
  const api = createV12Api(apiKey, { fetchFn: metadataFetch, wait });
  const previousMetadata = api.metadata;
  let queue = Promise.resolve();
  // Serialize candidate metadata evaluations too, so diagnostics cannot cross candidates.
  api.metadata = (song) => {
    const evaluation = queue.then(async () => {
      const eventStart = events.length, retryStart = retryCount;
      let data;
      try { data = await previousMetadata(song); }
      catch { data = { category: 'Unknown', releaseDate: null, effectiveReleaseDate: null,
        matching: 'METADATA_LOOKUP_FAILED', musicBrainzMatching: 'MUSICBRAINZ_LOOKUP_FAILED' }; }
      const failures = events.slice(eventStart);
      const unresolvedReason = data.artistResolution?.reason ?? '';
      // v1.2 caches artist resolution, including swallowed errors. Reclassify cached failures too.
      const cachedArtistFailure = !data.artistResolution?.resolved
        && /^MusicBrainz (?:HTTP|network|invalid|response)/u.test(unresolvedReason);
      const failed = failures.some((event) => event.exhausted) || cachedArtistFailure
        || /^iTunes failed:/u.test(data.matching ?? '') || data.matching === 'METADATA_LOOKUP_FAILED'
        || data.musicBrainzMatching === 'MUSICBRAINZ_LOOKUP_FAILED'
        || (data.musicBrainzAttempts ?? []).some((entry) => entry.matching === 'MUSICBRAINZ_LOOKUP_FAILED');
      const identityUnresolved = !!data.artistResolution && !data.artistResolution.resolved && !cachedArtistFailure;
      const status = failed ? 'METADATA_LOOKUP_FAILED'
        : classifyDate(data.effectiveReleaseDate) === 'Unknown' ? 'VERIFIED_UNKNOWN' : 'VERIFIED_DATE';
      if (data.artistResolution && !data.artistResolution.resolved) {
        data.artistResolution = { ...data.artistResolution,
          diagnostic: cachedArtistFailure ? 'METADATA_LOOKUP_FAILED' : 'IDENTITY_UNRESOLVED' };
      }
      api.requests.metadataRetryCount = retryCount;
      api.requests.metadataWireAttempts = wireAttempts;
      return { ...data, ...(failed ? { category: 'METADATA_LOOKUP_FAILED', releaseDecision: 'METADATA_LOOKUP_FAILED' } : {}), metadataVerificationStatus: status, identityUnresolved,
        identityDiagnostic: identityUnresolved ? 'IDENTITY_UNRESOLVED' : null,
        metadataRetryCount: retryCount - retryStart, metadataTransportDiagnostics: failures,
        cachedArtistLookupFailure: cachedArtistFailure };
    });
    queue = evaluation.catch(() => {});
    return evaluation;
  };
  return api;
}

export async function runExperiment({ shownResults, circle, baseline, v1_1Result }, api) {
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
        catch (error) { metadata = { metadataVerificationStatus: 'METADATA_LOOKUP_FAILED', effectiveReleaseDate: null, metadataError: 'Unexpected metadata evaluation failure' }; }
        metadataCache.set(key, metadata);
      }
      const metadata = metadataCache.get(key);
      report.evaluations.push({ title: song.title, artist: song.artist, ...metadata });
      if (metadata.metadataVerificationStatus === 'METADATA_LOOKUP_FAILED') {
        report.skipped.push({ title: song.title, artist: song.artist, reason: 'METADATA_LOOKUP_FAILED', ...metadata });
        continue;
      }
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
  assert(finalCandidates.every((song) => song.metadataVerificationStatus !== 'METADATA_LOOKUP_FAILED'
    && (song.category !== 'Unknown' || song.metadataVerificationStatus === 'VERIFIED_UNKNOWN')));
  assert(finalCandidates.every((song) => !song.cachedArtistLookupFailure
    && !(song.metadataTransportDiagnostics ?? []).some((event) => event.exhausted)));
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
  const comparison = compareV1(v1_1Result, finalCandidates, [...sameArtistReports, ...relatedArtistReports], metadataCache);
  return { experiment: 'Personal Recall v1.2.1', executionStatus: 'completed', era: ERA, anchors: seeds,
    policy: 'Original 12 high-intent Seeds only. SAME_ARTIST top-track rank; RELATED_ARTIST match DESC then top-track rank ASC. No weighted score, chart ranking, feedback Anchors or quota refill.',
    budget: BUDGET, requestCounts: api.requests ?? null, comparison, shownInputFiles: SHOWN_FILES,
    diagnostics: { releaseCaveat: 'iTunes dates are earliest observed exact-match catalog listings, not original-release ground truth. MusicBrainz exact matching can rescue catalog-date conflicts or resolve Unknown; dates remain evidence, not guaranteed original releases. Partial MB dates retain precision. Title/credit mismatches remain Unknown.',
      countMeaning: 'Exclusion counters count attempted candidate rows across channels, not distinct identities.',
      coverageCaveat: 'Bounded lookup windows, metadata availability and previous-shown exclusions affect success; this is not a full-catalog coverage measure.' },
    summary: { verifiedUnknownCount: finalCandidates.filter((s) => s.metadataVerificationStatus === 'VERIFIED_UNKNOWN').length,
      identityUnresolvedCount: [...metadataCache.values()].filter((s) => s.identityUnresolved).length,
      metadataLookupFailedCount: [...metadataCache.values()].filter((s) => s.metadataVerificationStatus === 'METADATA_LOOKUP_FAILED').length,
      metadataRetryCount: api.requests?.metadataRetryCount ?? [...metadataCache.values()].reduce((sum, s) => sum + (s.metadataRetryCount ?? 0), 0),
      candidatesSkippedForLookupFailure: [...sameArtistReports, ...relatedArtistReports].flatMap((r) => r.skipped).filter((s) => s.reason === 'METADATA_LOOKUP_FAILED').length,
      metadataCountMeaning: 'verifiedUnknownCount is final candidates; identityUnresolvedCount and metadataLookupFailedCount are distinct evaluated identities; skipped count is attempted rows; retries are additional wire requests.',
      totalSeeds: 12, sameArtistSeedSuccess: same, sameArtistSeedFailure: 12 - same,
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
    validation: { transportFailureUnknownFinalCandidates: 0, onlyOriginalSeeds: true, feedbackAnchorsUsed: 0, originalSeedReappearances: 0,
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
  const resolutions = new Map(allEvidence.filter((row) => row.artistResolution).map((row) => [
    row.artistResolution.searchTerms?.[0] ?? JSON.parse(row.identity)[1], row.artistResolution]));
  return { artistResolvedCount: [...resolutions.values()].filter((r) => r.resolved).length,
    artistAliasMatchedCount: [...resolutions.values()].filter((r) => r.resolved && r.aliasMatched).length,
    artistResolutionFailedCount: [...resolutions.values()].filter((r) => !r.resolved).length,
    additionalSameRecordingVariantsSkipped: reports.flatMap((r) => r.skipped).filter((row) => row.reason === 'SAME_RECORDING_VARIANT'
      && v1.finalCandidates.some((song) => keyOf(song) === keyOf(row))).length,
    unknownResolvedByArtistAwareMusicBrainz: v1UnknownDiagnostics.filter((row) => row.metadata?.artistResolution?.resolved
      && row.metadata.musicBrainzFirstReleaseDate && row.metadata.category !== 'Unknown').length,
    futureCaughtByArtistAwareMusicBrainz: allEvidence.filter((row) => row.artistResolution?.resolved && row.releaseDecision === 'FUTURE_CAUGHT_BY_MUSICBRAINZ').length,
    overlapWithV1_1: candidates.filter((song) => oldKeys.has(keyOf(song))).length,
    replacedFromV1_1: v1.finalCandidates.filter((song) => !newKeys.has(keyOf(song))).length,
    newComparedToV1_1: candidates.filter((song) => !oldKeys.has(keyOf(song))).length,
    v1_1UnknownCount: v1.finalCandidates.filter((song) => song.category === 'Unknown').length,
    v1_2UnknownCount: candidates.filter((song) => song.category === 'Unknown').length,
    v1UnknownResolvedByMusicBrainz: v1UnknownDiagnostics.filter((row) => row.metadata?.musicBrainzFirstReleaseDate
      && row.metadata.category !== 'Unknown').length,
    unknownResolvedByMusicBrainz: allEvidence.filter((row) => !row.itunesReleaseDate && row.musicBrainzFirstReleaseDate).length,
    futureCaughtByMusicBrainz: allEvidence.filter((row) => row.releaseDecision === 'FUTURE_CAUGHT_BY_MUSICBRAINZ').length,
    rescuedFromItunesFuture: allEvidence.filter((row) => row.releaseDecision === 'RESCUED_BY_MUSICBRAINZ').length,
    stillUnknown: candidates.filter((song) => song.category === 'Unknown').length,
    mediaArtifactsSkipped: reports.flatMap((report) => report.skipped).filter((row) => row.reason === 'MEDIA_ARTIFACT').length,
    sameRecordingVariantsSkipped: reports.flatMap((report) => report.skipped).filter((row) => row.reason === 'SAME_RECORDING_VARIANT').length,
    additionalVariantCountMeaning: 'v1.1 final candidate rows now skipped as SAME_RECORDING_VARIANT, not a difference of attempted-row totals across runs.',
    countMeaning: 'Metadata improvement counts are distinct evaluated semantic tracks, including rejected tracks; stillUnknown is final candidates. v1 Unknown tracks not encountered are reported separately, never assumed resolved.',
    v1UnknownDiagnostics, changes,
    metadataEvidence: allEvidence,
    blindEvaluationCaveat: 'Unknown dates and conservative exact-match gaps remain unverified. Inspect diagnostics before treating the set as Era-valid; metadata validation alone does not establish personal listening.' };
}

export async function main() {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) throw new Error('Set LASTFM_API_KEY in the process environment. No result was generated.');
  const inputs = { ...loadV1Inputs(), v1_1Result: read('results/personal-recall/personal-recall-v1_1-2016-2018.json') };
  console.log('Personal Recall v1.2.1: unchanged v1 generation/ranking and lookup budget; media/variant filters and MusicBrainz release verification added. Sequential requests may take several minutes.');
  const output = await runExperiment(inputs, createApi(apiKey));
  mkdirSync(new URL('../results/personal-recall/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../results/personal-recall/personal-recall-v1_2_1-2016-2018.json', import.meta.url), JSON.stringify(output, null, 2), 'utf8');
  console.log(JSON.stringify({ summary: output.summary, comparison: { ...output.comparison, changes: undefined, metadataEvidence: undefined, v1UnknownDiagnostics: undefined } }, null, 2));
  for (const [index, seed] of seeds.entries()) {
    console.log(`\nSeed: ${label(seed)}`);
    for (const [channel, report] of [['SAME_ARTIST', output.sameArtistReports[index]], ['RELATED_ARTIST', output.relatedArtistReports[index]]]) {
      console.log(`${channel}: ${report.success ? label(report.candidate) : `FAILED: ${report.failureReason}`}`);
    }
  }
  for (const change of output.comparison.changes) {
    console.log(`\nv1.1 ${label(change.v1Candidate)} -> ${change.reason} -> ${change.replacement ? label(change.replacement) : 'No replacement'}`);
  }
  console.log('\nFinal candidates:');
  for (const song of output.finalCandidates) {
    console.log(`${song.rank}. ${song.title} - ${song.artist} [${song.source}; ${song.category}; evidence=${song.releaseEvidence}; date=${song.effectiveReleaseDate ?? 'Unknown'}]`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
