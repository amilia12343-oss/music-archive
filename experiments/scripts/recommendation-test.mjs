// One-off experiment; does not import or write React app data.
// API references:
// https://www.last.fm/api/show/track.getSimilar
// https://www.last.fm/api/show/track.search
// https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const START_MONTH = '2016-01';
const END_MONTH = '2018-12';
const SIMILAR_LIMIT = 50;
const POOL_LIMIT = 60;
const OUTPUT_LIMIT = 30;
const ITUNES_CONCURRENCY = 2;
const ITUNES_START_INTERVAL = 3100;

export const seeds = [
  ['BIGBANG', '거짓말'], ['리쌍', '광대'], ['TWICE', 'CHEER UP'],
  ['볼빨간사춘기', '심술'], ['박원', '노력'], ['WINNER', 'REALLY REALLY'],
  ['IU', '가을 아침'], ['넉살', 'N분의1'], ['BTOB', '그리워하다'],
  ['HAON(김하온)', '붕붕'], ['SHAUN', 'Way Back Home'], ['iKON', '사랑을 했다'],
].map(([artist, title]) => ({ artist, title }));

// Do not strip feat/version suffixes or assume translated names are identical.
export const normalize = (text) => text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
const songKey = ({ title, artist }) => JSON.stringify([normalize(title), normalize(artist)]);
const label = ({ title, artist }) => `${artist} - ${title}`;

export function releaseCategory(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)
    || !Number.isFinite(Date.parse(value))) return 'Unknown';
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) return 'Unknown';
  const month = value.slice(0, 7);
  return month > END_MONTH ? 'Future' : month < START_MONTH ? 'Older' : 'Era-period';
}

export function mergeCandidates(seedResults, excludedSeeds = seeds) {
  const excluded = new Set(excludedSeeds.map(songKey));
  // Include Last.fm's autocorrected seed identity in the exclusion set.
  for (const { corrected } of seedResults) if (corrected) excluded.add(songKey(corrected));
  const pool = new Map();
  for (const { seed, tracks } of seedResults) {
    for (const item of tracks) {
      const title = item?.name;
      const artist = item?.artist?.name;
      if (typeof title !== 'string' || !title.trim() || typeof artist !== 'string' || !artist.trim()) continue;
      const match = Number(item.match);
      if (item.match === undefined || item.match === null || item.match === '' || !Number.isFinite(match) || match < 0) continue;
      const song = { title: title.trim(), artist: artist.trim() };
      const key = songKey(song);
      if (excluded.has(key)) continue;
      let candidate = pool.get(key);
      if (!candidate) {
        candidate = { ...song, similarity: match, sources: [] };
        pool.set(key, candidate);
      }
      candidate.similarity = Math.max(candidate.similarity, match);
      const source = candidate.sources.find((entry) => songKey(entry.seed) === songKey(seed));
      if (source) source.match = Math.max(source.match, match);
      else candidate.sources.push({ seed, match });
    }
  }
  return [...pool.values()].sort((a, b) => b.similarity - a.similarity);
}

async function getJson(url) {
  // Never print a request URL or a raw fetch error: Last.fm URLs contain the key.
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('Network failure or 20-second timeout'); }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  try { return await response.json(); }
  catch { throw new Error('Invalid JSON response'); }
}

async function getSimilar(seed, apiKey) {
  const params = new URLSearchParams({ method: 'track.getSimilar', artist: seed.artist,
    track: seed.title, api_key: apiKey, format: 'json', autocorrect: '1', limit: String(SIMILAR_LIMIT) });
  const data = await getJson(`https://ws.audioscrobbler.com/2.0/?${params}`);
  if (data?.error) throw new Error(`Last.fm error ${Number(data.error)}`);
  const similar = data?.similartracks;
  if (!similar) throw new Error('Missing similartracks response');
  const tracks = similar.track === undefined ? [] : Array.isArray(similar.track) ? similar.track : [similar.track];
  const attrs = similar['@attr'];
  const corrected = typeof attrs?.artist === 'string' && typeof attrs?.track === 'string'
    ? { artist: attrs.artist, title: attrs.track } : undefined;
  return { seed, tracks: tracks.slice(0, SIMILAR_LIMIT), corrected };
}

export function selectCanonical(seed, matches) {
  // Search relevance alone is not proof of identity. Require both names to match.
  const match = matches.find((item) => typeof item?.name === 'string'
    && typeof item.artist === 'string'
    && songKey({ title: item.name, artist: item.artist }) === songKey(seed));
  return match ? { title: match.name.trim(), artist: match.artist.trim() } : undefined;
}

async function searchCanonical(seed, apiKey) {
  const params = new URLSearchParams({ method: 'track.search', track: seed.title,
    artist: seed.artist, api_key: apiKey, format: 'json', limit: '30' });
  const data = await getJson(`https://ws.audioscrobbler.com/2.0/?${params}`);
  if (data?.error) throw new Error(`Last.fm error ${Number(data.error)}`);
  if (!data?.results?.trackmatches) throw new Error('Missing trackmatches response');
  const value = data.results.trackmatches.track;
  return selectCanonical(seed, value === undefined ? [] : Array.isArray(value) ? value : [value]);
}

export async function resolveSeed(seed, apiKey) {
  const report = { originalSeed: label(seed), directCount: null, searchUsed: false,
    canonical: '-', retryCount: null, success: false, note: '' };
  let response;
  try {
    response = await getSimilar(seed, apiKey);
    report.directCount = response.tracks.length;
    if (response.tracks.length > 0) {
      report.success = true;
      return { response, report };
    }
    report.searchUsed = true;
    await sleep(300);
    const canonical = await searchCanonical(seed, apiKey);
    if (!canonical) {
      report.note = 'No conservative title + artist match';
      return { response, report };
    }
    report.canonical = label(canonical);
    await sleep(300);
    const retry = await getSimilar(canonical, apiKey);
    report.retryCount = retry.tracks.length;
    report.success = retry.tracks.length > 0;
    report.note = report.success ? 'Recovered by search' : 'Retry still returned 0';
    // Keep original Seed provenance, but exclude canonical identity from candidates.
    response = { ...retry, seed, corrected: retry.corrected ?? canonical };
  } catch (error) {
    report.note = error.message;
  }
  return { response, report };
}

async function matchItunes(candidate) {
  // Same Search API as the app; one request per candidate, no alternate-query retries.
  const params = new URLSearchParams({ term: `${candidate.artist} ${candidate.title}`,
    media: 'music', entity: 'song', limit: '25' });
  const data = await getJson(`https://itunes.apple.com/search?${params}`);
  if (!Array.isArray(data?.results)) throw new Error('Missing iTunes results');
  const matches = data.results.filter((item) => item?.kind === 'song'
    && typeof item.trackName === 'string' && typeof item.artistName === 'string'
    && songKey({ title: item.trackName, artist: item.artistName }) === songKey(candidate));
  // Conservative identity matching: aliases/translations become Unknown rather than false matches.
  const dates = matches.map((item) => item.releaseDate)
    .filter((value) => releaseCategory(value) !== 'Unknown').sort();
  return { releaseDate: dates[0]?.slice(0, 10),
    matching: !matches.length ? 'No exact title/artist match' : !dates.length ? 'Matched; date unavailable' : 'Exact normalized match',
    itunesMatches: matches.length };
}

async function enrichCandidates(pool) {
  let index = 0;
  let nextStart = Date.now();
  async function worker() {
    while (index < pool.length) {
      const candidate = pool[index++];
      const start = Math.max(Date.now(), nextStart);
      nextStart = start + ITUNES_START_INTERVAL;
      await sleep(Math.max(0, start - Date.now()));
      try { Object.assign(candidate, await matchItunes(candidate)); }
      catch (error) { candidate.matching = `iTunes failed: ${error.message}`; }
      candidate.category = releaseCategory(candidate.releaseDate);
    }
  }
  await Promise.all(Array.from({ length: ITUNES_CONCURRENCY }, worker));
}

export function eraAware(pool) {
  return pool.filter((song) => releaseCategory(song.releaseDate) !== 'Future')
    .sort((a, b) => Number(releaseCategory(b.releaseDate) === 'Era-period')
      - Number(releaseCategory(a.releaseDate) === 'Era-period') || b.similarity - a.similarity);
}

export function resultRows(candidates) {
  return candidates.slice(0, OUTPUT_LIMIT).map((song, index) => ({
    rank: index + 1, title: song.title, artist: song.artist,
    releaseDate: song.releaseDate ?? 'Unknown', category: releaseCategory(song.releaseDate),
    similarity: song.similarity,
    recommendedBy: song.sources.map(({ seed, match }) => `${label(seed)} [${match}]`).join(' / '),
    matching: song.matching ?? 'Unknown',
  }));
}

function printResults(title, candidates) {
  console.log(`\n${title} (${Math.min(candidates.length, OUTPUT_LIMIT)} songs)`);
  console.table(resultRows(candidates));
}

export function writeResults(reports, pool, aware, outputPath = new URL('../results/lastfm/recommendation-fallback-output.json', import.meta.url)) {
  const data = {
    era: { startMonth: START_MONTH, endMonth: END_MONTH },
    seedSummary: {
      total: reports.length,
      directSuccess: reports.filter((report) => report.directCount > 0).length,
      fallbackSuccess: reports.filter((report) => report.searchUsed && report.success).length,
      finalSuccess: reports.filter((report) => report.success).length,
      reports,
    },
    failedSeeds: reports.filter((report) => !report.success).map((report) => report.originalSeed),
    counts: Object.fromEntries(['Era-period', 'Older', 'Unknown', 'Future']
      .map((category) => [category, pool.filter((song) => song.category === category).length])),
    rawSimilar: resultRows(pool),
    eraAware: resultRows(aware),
  };
  mkdirSync(new URL('../results/lastfm/', import.meta.url), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
}

export async function main() {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) throw new Error('Set LASTFM_API_KEY before running this script.');
  console.log(`Era ${START_MONTH} ~ ${END_MONTH}; ${seeds.length} seeds`);
  console.log(`Budget: ${seeds.length} direct Last.fm requests + at most one search and one retry per empty Seed (maximum ${seeds.length * 3}); up to ${POOL_LIMIT} iTunes requests; no pagination.`);
  console.log('Canonical policy: exact normalized title AND artist; first qualifying search result. No translated aliases or fuzzy matching.');
  const responses = [];
  const reports = [];
  for (const seed of seeds) {
    const { response, report } = await resolveSeed(seed, apiKey);
    if (response) responses.push(response);
    reports.push(report);
    console.log(`${report.originalSeed}: direct=${report.directCount ?? 'Error'}, search=${report.searchUsed}, canonical=${report.canonical}, retry=${report.retryCount ?? '-'}, ${report.success ? 'SUCCESS' : 'FAILED'}${report.note ? ` (${report.note})` : ''}`);
    await sleep(300);
  }
  console.table(reports.map((report) => ({ ...report, success: report.success ? 'SUCCESS' : 'FAILED' })));
  const failures = reports.filter((report) => !report.success);
  console.log(`Seed summary (${seeds.length}): direct success=${reports.filter((report) => report.directCount > 0).length}; added by search fallback=${reports.filter((report) => report.searchUsed && report.success).length}; final success=${reports.filter((report) => report.success).length}`);
  console.log('Still failed:', failures.map((report) => report.originalSeed).join(' / ') || 'None');
  const merged = mergeCandidates(responses);
  const pool = merged.slice(0, POOL_LIMIT);
  console.log(`Deduplicated pool: ${merged.length}; top ${pool.length} candidates evaluated; failed seeds: ${failures.length}`);
  if (!pool.length) throw new Error('No candidates. Inspect Seed names, API errors and empty responses above.');
  await enrichCandidates(pool);
  console.log('RAW: maximum Last.fm match across seeds, descending; ties preserve first discovery order.');
  console.log('ERA-AWARE: exclude Future, prioritize Era-period, then similarity; Older/Unknown share the remaining tier.');
  console.log('Counts:', Object.fromEntries(['Era-period', 'Older', 'Unknown', 'Future']
    .map((category) => [category, pool.filter((song) => song.category === category).length])));
  console.log('Dates are the earliest observed exact-match iTunes listing, NOT verified original release dates. Reissues can misclassify old songs as Future.');
  console.log('Alias/translated-name mismatches and request failures are Unknown, NOT evidence of a release date. Partial Seed failures bias both lists.');
  printResults('A. RAW SIMILAR', pool);
  const aware = eraAware(pool);
  printResults('B. ERA-AWARE', aware);
  writeResults(reports, pool, aware);
  console.log('UTF-8 JSON saved: experiments/results/lastfm/recommendation-fallback-output.json');
  if (aware.length < OUTPUT_LIMIT) console.log(`Only ${aware.length} eligible candidates; no fabricated songs or refill requests.`);
  console.log('Human evaluation: which songs recall this Era? Inspect Unknown matches, reissues, repeated artists and Seed coverage before choosing a provider.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
