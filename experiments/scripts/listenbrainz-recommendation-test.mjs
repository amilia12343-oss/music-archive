// One-off comparison: importing the Last.fm helpers does not run that experiment.
// Official request formats and response schemas:
// https://labs.api.listenbrainz.org/recording-search
// https://labs.api.listenbrainz.org/similar-recordings
// https://github.com/metabrainz/data-set-hoster/blob/master/README.md
// https://github.com/metabrainz/listenbrainz-server/blob/master/listenbrainz/labs_api/labs/api/recording_search.py
// https://github.com/metabrainz/listenbrainz-server/blob/master/listenbrainz/labs_api/labs/api/similar_recordings/base.py
import { mkdirSync, writeFileSync } from 'node:fs';
import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { seeds, normalize, releaseCategory } from './recommendation-test.mjs';

// Match the working Node CLI settings before any fetch opens a connection.
// These defaults apply only to this Node process, including diagnostic mode.
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);

const BASE = 'https://labs.api.listenbrainz.org';
// Identify the application and provide a real project contact URL (no token).
const USER_AGENT = 'MusicArchive-RecommendationTest/0.1 ( https://github.com/amilia12343-oss/music-archive )';
const ALGORITHM = 'session_based_days_7500_session_300_contribution_5_threshold_15_limit_50_skip_30_top_n_listeners_1000';
const POOL_LIMIT = 60;
const OUTPUT_LIMIT = 30;
const SIMILAR_LIMIT = 50;
const songKey = ({ title, artist }) => JSON.stringify([normalize(title), normalize(artist)]);
const label = ({ title, artist }) => `${artist} - ${title}`;
const mbid = (value) => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ? value.toLowerCase() : null;
const scoreOf = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const byScore = (a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || 0;

async function getJson(url, options = {}) {
  let response;
  const headers = new Headers(options.headers);
  if (new URL(url).origin === BASE) {
    headers.set('User-Agent', USER_AGENT);
    headers.set('Accept', 'application/json');
  }
  try { response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(20000) }); }
  catch (error) {
    const causes = errorDetails(error);
    throw new Error(causes.map(({ type, message, code }) => `${type}: ${message}${code ? ` [${code}]` : ''}`).join(' -> '), { cause: error });
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  try { return await response.json(); }
  catch { throw new Error('Invalid JSON response'); }
}

export function errorDetails(error) {
  const entries = [];
  const seen = new Set();
  function visit(value) {
    if (!value || seen.has(value)) return;
    seen.add(value);
    entries.push({ type: value.name ?? typeof value, message: value.message ?? String(value),
      code: value.code ?? null, syscall: value.syscall ?? null,
      address: value.address ?? null, port: value.port ?? null });
    visit(value.cause);
    if (Array.isArray(value.errors)) value.errors.forEach(visit);
  }
  visit(error);
  return entries;
}

// A single search only: no similar-recordings, iTunes, result-file write or retries.
export async function diagnostic() {
  const url = `${BASE}/recording-search/json?${new URLSearchParams({ query: 'TWICE CHEER UP' })}`;
  const headers = { Accept: 'application/json', 'User-Agent': USER_AGENT };
  const started = performance.now();
  const report = { requestUrl: url, method: 'GET', query: 'TWICE CHEER UP', body: null,
    headers, timeoutMs: 60000, nodeVersion: process.version, statusCode: null,
    responseTimeMs: null, totalTimeMs: null, contentType: null, finalUrl: null };
  console.log('Diagnostic request:', JSON.stringify(report, null, 2));
  try {
    const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(60000) });
    Object.assign(report, { statusCode: response.status, responseTimeMs: Math.round(performance.now() - started),
      contentType: response.headers.get('content-type'), finalUrl: response.url });
    console.log('HTTP response:', JSON.stringify(report, null, 2));
    const text = await response.text();
    if (!response.ok) {
      report.responsePreview = text.slice(0, 1000);
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('Expected a JSON array');
    report.resultCount = data.length;
    report.results = data.slice(0, 5).map((row) => ({ recording_name: row.recording_name,
      artist_credit_name: row.artist_credit_name, recording_mbid: row.recording_mbid,
      release_name: row.release_name, release_mbid: row.release_mbid }));
    report.success = true;
  } catch (error) {
    report.success = false;
    report.errors = errorDetails(error);
    process.exitCode = 1;
  }
  report.totalTimeMs = Math.round(performance.now() - started);
  console.log('Diagnostic result:', JSON.stringify(report, null, 2));
  return report;
}

export function selectRecording(seed, rows) {
  const matches = rows.filter((row) => typeof row?.recording_name === 'string'
    && typeof row.artist_credit_name === 'string' && mbid(row.recording_mbid)
    && songKey({ title: row.recording_name, artist: row.artist_credit_name }) === songKey(seed));
  const identities = new Set(matches.map((row) => mbid(row.recording_mbid)));
  if (!identities.size) return { reason: 'No exact normalized title AND artist match' };
  if (identities.size > 1) return { reason: 'Ambiguous: multiple exact-match recording MBIDs' };
  return { recording: matches[0] };
}

export async function resolveSeed(seed) {
  const report = { originalSeed: label(seed), recordingSearchSucceeded: false,
    recordingMatched: false, matchedTitle: null, matchedArtist: null, recordingMbid: null,
    similarRecordingsCount: 0, usableCandidateCount: 0, success: false, failureReason: null };
  let recording;
  let tracks = [];
  let stage = 'recording-search';
  try {
    const params = new URLSearchParams({ query: `${seed.artist} ${seed.title}` });
    const rows = await getJson(`${BASE}/recording-search/json?${params}`);
    if (!Array.isArray(rows)) throw new Error('Expected a JSON array');
    report.recordingSearchSucceeded = true;
    const selected = selectRecording(seed, rows);
    if (!selected.recording) {
      report.failureReason = selected.reason;
      return { seed, recording, tracks, report };
    }
    recording = selected.recording;
    Object.assign(report, { recordingMatched: true, matchedTitle: recording.recording_name,
      matchedArtist: recording.artist_credit_name, recordingMbid: mbid(recording.recording_mbid) });
    stage = 'similar-recordings';
    // Hoster POST takes an ARRAY of input objects; count caps returned rows.
    const similar = await getJson(`${BASE}/similar-recordings/json?count=${SIMILAR_LIMIT}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ recording_mbids: [report.recordingMbid], algorithm: ALGORITHM }]),
    });
    if (!Array.isArray(similar)) throw new Error('Expected a JSON array');
    tracks = similar.filter((row) => row && !('comment' in row)).slice(0, SIMILAR_LIMIT);
    report.similarRecordingsCount = tracks.length;
    report.usableCandidateCount = tracks.filter((row) => typeof row.recording_name === 'string'
      && row.recording_name.trim() && typeof row.artist_credit_name === 'string'
      && row.artist_credit_name.trim() && mbid(row.recording_mbid) !== report.recordingMbid
      && songKey({ title: row.recording_name, artist: row.artist_credit_name }) !== songKey(seed)).length;
    report.success = report.usableCandidateCount > 0;
    if (!report.success) report.failureReason = tracks.length
      ? 'No usable non-self recommendations' : 'No similar recordings returned';
  } catch (error) { report.failureReason = `${stage}: ${error.message}`; }
  return { seed, recording, tracks, report };
}

export function mergeCandidates(responses) {
  const excludedNames = new Set(seeds.map(songKey));
  const excludedMbids = new Set();
  for (const { recording } of responses) {
    if (!recording) continue;
    excludedMbids.add(mbid(recording.recording_mbid));
    excludedNames.add(songKey({ title: recording.recording_name, artist: recording.artist_credit_name }));
  }
  const pool = new Map();
  for (const { seed, recording, tracks } of responses) {
    for (const row of tracks) {
      if (typeof row?.recording_name !== 'string' || !row.recording_name.trim()
        || typeof row.artist_credit_name !== 'string' || !row.artist_credit_name.trim()) continue;
      const song = { title: row.recording_name.trim(), artist: row.artist_credit_name.trim() };
      const recordingMbid = mbid(row.recording_mbid);
      if (excludedNames.has(songKey(song)) || (recordingMbid && excludedMbids.has(recordingMbid))) continue;
      const key = recordingMbid ? `mbid:${recordingMbid}` : `name:${songKey(song)}`;
      const score = scoreOf(row.score);
      let candidate = pool.get(key);
      if (!candidate) {
        candidate = { ...song, recordingMbid, score, sources: [] };
        pool.set(key, candidate);
      }
      if (score !== null && (candidate.score === null || score > candidate.score)) candidate.score = score;
      // Preserve each observed provider score, including repeated rows, without weighting it.
      candidate.sources.push({ originalSeed: label(seed), score,
        seedRecordingMbid: mbid(recording?.recording_mbid), referenceMbid: mbid(row.reference_mbid) });
    }
  }
  return [...pool.values()].sort(byScore);
}

export async function matchItunes(candidate) {
  // Same one-query, exact-name policy, market and limit as the Last.fm experiment.
  const params = new URLSearchParams({ term: `${candidate.artist} ${candidate.title}`,
    media: 'music', entity: 'song', limit: '25' });
  const data = await getJson(`https://itunes.apple.com/search?${params}`);
  if (!Array.isArray(data?.results)) throw new Error('Missing iTunes results');
  const matches = data.results.filter((item) => item?.kind === 'song'
    && typeof item.trackName === 'string' && typeof item.artistName === 'string'
    && songKey({ title: item.trackName, artist: item.artistName }) === songKey(candidate));
  const dates = matches.map((item) => item.releaseDate)
    .filter((value) => releaseCategory(value) !== 'Unknown').sort();
  return { releaseDate: dates[0]?.slice(0, 10),
    matching: !matches.length ? 'No exact title/artist match'
      : !dates.length ? 'Matched; date unavailable' : 'Exact normalized match',
    itunesMatches: matches.length };
}

async function enrichCandidates(pool) {
  let index = 0;
  let nextStart = Date.now();
  async function worker() {
    while (index < pool.length) {
      const candidate = pool[index++];
      const start = Math.max(Date.now(), nextStart);
      nextStart = start + 3100;
      await sleep(Math.max(0, start - Date.now()));
      try { Object.assign(candidate, await matchItunes(candidate)); }
      catch (error) { candidate.matching = `iTunes failed: ${error.message}`; }
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker));
}

export function eraAware(pool) {
  return pool.filter((song) => releaseCategory(song.releaseDate) !== 'Future')
    .sort((a, b) => Number(releaseCategory(b.releaseDate) === 'Era-period')
      - Number(releaseCategory(a.releaseDate) === 'Era-period') || byScore(a, b));
}

export function resultRows(pool) {
  return pool.slice(0, OUTPUT_LIMIT).map((song, index) => ({ rank: index + 1,
    recordingMbid: song.recordingMbid, title: song.title, artist: song.artist,
    releaseDate: song.releaseDate ?? 'Unknown', category: releaseCategory(song.releaseDate),
    score: song.score, recommendedBy: song.sources, matching: song.matching ?? 'Unknown' }));
}

export function buildOutput(reports, merged, pool) {
  return {
    era: { startMonth: '2016-01', endMonth: '2018-12' },
    provider: { name: 'ListenBrainz Dataset Hoster / MusicBrainz', baseUrl: BASE, algorithm: ALGORITHM,
      recordingMatchPolicy: 'Exact normalized title AND artist; ambiguous MBIDs fail. No alias/fuzzy matching.',
      releaseDateSource: 'iTunes Search API: provider response schemas have release names/MBIDs but no release date.',
      releaseDatePolicy: 'Earliest observed exact-match iTunes listing, not verified original release. Reissues may misclassify Older as Future.',
      rawSort: 'Maximum provider score across Seeds, descending; stable discovery order for ties. Missing scores last.',
      eraSort: 'Exclude Future; Era-period first, then score. Older and Unknown share the remaining tier.',
      comparisonCaution: 'Provider scores are not numerically comparable to Last.fm match. Strict naming and ambiguous-recording failures can reduce Seed coverage.',
      limits: { similarPerSeed: SIMILAR_LIMIT, evaluatedCandidates: POOL_LIMIT, output: OUTPUT_LIMIT,
        itunesConcurrency: 2, itunesStartIntervalMs: 3100 },
    },
    seedSummary: { total: reports.length,
      recordingMatches: reports.filter((row) => row.recordingMatched).length,
      seedsWithSimilarRecordings: reports.filter((row) => row.similarRecordingsCount > 0).length,
      successfulSeeds: reports.filter((row) => row.success).length, reports },
    failedSeeds: reports.filter((row) => !row.success)
      .map((row) => ({ originalSeed: row.originalSeed, reason: row.failureReason })),
    counts: { deduplicatedCandidates: merged.length, evaluatedCandidates: pool.length,
      ...Object.fromEntries(['Era-period', 'Older', 'Unknown', 'Future'].map((category) =>
        [category, pool.filter((song) => releaseCategory(song.releaseDate) === category).length])) },
    rawSimilar: resultRows(pool), eraAware: resultRows(eraAware(pool)),
  };
}

export async function main() {
  console.log(`ListenBrainz comparison: ${seeds.length} Seeds; at most 12 searches, 12 similar requests and 60 iTunes requests. No pagination/retries.`);
  const responses = [];
  for (const seed of seeds) {
    const response = await resolveSeed(seed);
    responses.push(response);
    console.log(`${label(seed)}: ${response.report.success ? 'SUCCESS' : 'FAILED'}; similar=${response.report.similarRecordingsCount}; ${response.report.failureReason ?? response.report.recordingMbid}`);
    await sleep(300);
  }
  const merged = mergeCandidates(responses);
  const pool = merged.slice(0, POOL_LIMIT);
  await enrichCandidates(pool);
  const data = buildOutput(responses.map(({ report }) => report), merged, pool);
  mkdirSync(new URL('../results/listenbrainz/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../results/listenbrainz/listenbrainz-recommendation-output.json', import.meta.url),
    JSON.stringify(data, null, 2), 'utf8');
  console.log(`Recording matches=${data.seedSummary.recordingMatches}; Seeds with similar results=${data.seedSummary.seedsWithSimilarRecordings}; usable successes=${data.seedSummary.successfulSeeds}; candidates=${merged.length}`);
  console.log(`Saved UTF-8 JSON: experiments/results/listenbrainz/listenbrainz-recommendation-output.json; RAW=${data.rawSimilar.length}; ERA-AWARE=${data.eraAware.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = process.argv.includes('--diagnostic') ? diagnostic : main;
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
