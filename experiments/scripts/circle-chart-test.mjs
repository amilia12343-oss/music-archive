// 2016–2018 baseline from the first-party JSON request confirmed in browser Network.
// Confirmed public page: https://circlechart.kr/page_chart/onoff.circle
import { mkdirSync, writeFileSync } from 'node:fs';
import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);
const PERIODS = Array.from({ length: 36 }, (_, index) =>
  `${2016 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`);
const normalize = (text) => text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();

export function parseTracks(list) {
  if (!list || typeof list !== 'object') throw new Error('Missing or invalid List');
  return Object.values(list).map((row) => {
    const rank = Number(row?.SERVICE_RANKING);
    if (!Number.isInteger(rank) || rank < 1 || rank > 100) return null;
    if (typeof row.SONG_NAME !== 'string' || !row.SONG_NAME.trim()
      || typeof row.ARTIST_NAME !== 'string' || !row.ARTIST_NAME.trim()) {
      throw new Error(`Missing title or artist at rank ${rank}`);
    }
    return { rank, title: row.SONG_NAME.trim(), artist: row.ARTIST_NAME.trim(),
      album: typeof row.ALBUM_NAME === 'string' ? row.ALBUM_NAME.trim() : null,
      sourceTrackId: row.SEQ_MOM == null ? null : String(row.SEQ_MOM).trim() || null };
  }).filter(Boolean).sort((a, b) => a.rank - b.rank).slice(0, 100);
}

export function aggregateTracks(months) {
  const pool = new Map();
  // Only complete, verified monthly TOP 100 lists contribute to the baseline.
  for (const month of months.filter((entry) => entry.success).sort((a, b) => a.period.localeCompare(b.period))) {
    for (const song of month.tracks) {
      const key = song.sourceTrackId ? `id:${song.sourceTrackId}`
        : `name:${JSON.stringify([normalize(song.title), normalize(song.artist)])}`;
      let track = pool.get(key);
      if (!track) {
        track = { sourceTrackId: song.sourceTrackId, title: song.title, artist: song.artist,
          album: song.album, chartHistory: [] };
        pool.set(key, track);
      }
      // One contribution per song per month; retain its best rank if repeated.
      const previous = track.chartHistory.find((entry) => entry.period === month.period);
      if (previous) previous.rank = Math.min(previous.rank, song.rank);
      else track.chartHistory.push({ period: month.period, rank: song.rank });
    }
  }
  return [...pool.values()].map((track) => ({ ...track,
    monthsOnChart: track.chartHistory.length,
    bestRank: Math.min(...track.chartHistory.map((entry) => entry.rank)),
    firstSeenMonth: track.chartHistory[0].period,
    lastSeenMonth: track.chartHistory.at(-1).period,
    eraScore: track.chartHistory.reduce((sum, entry) => sum + 101 - entry.rank, 0),
  })).sort((a, b) => b.eraScore - a.eraScore);
}

export function timeBalancedTop30(tracks) {
  const selected = new Set();
  const results = [];
  for (let offset = 0; offset < PERIODS.length; offset += 6) {
    const startMonth = PERIODS[offset];
    const endMonth = PERIODS[offset + 5];
    const candidates = new Map();
    for (const track of tracks) {
      const key = JSON.stringify([normalize(track.title), normalize(track.artist)]);
      if (selected.has(key)) continue;
      const history = track.chartHistory.filter(({ period }) => period >= startMonth && period <= endMonth);
      if (!history.length) continue;
      let candidate = candidates.get(key);
      if (!candidate) {
        candidate = { track, monthlyRanks: new Map() };
        candidates.set(key, candidate);
      }
      // Different Circle IDs for the same song count once per month, at its best rank.
      for (const { period, rank } of history) {
        candidate.monthlyRanks.set(period, Math.min(candidate.monthlyRanks.get(period) ?? Infinity, rank));
      }
    }
    const ranked = [...candidates.entries()].map(([key, candidate]) => ({ key,
      track: candidate.track,
      segmentScore: [...candidate.monthlyRanks.values()].reduce((sum, rank) => sum + 101 - rank, 0),
    })).sort((a, b) => b.segmentScore - a.segmentScore);
    for (const { key, track, segmentScore } of ranked.slice(0, 5)) {
      selected.add(key);
      results.push({ ...track, selectedSegment: { startMonth, endMonth }, segmentScore });
    }
  }
  // If a segment has fewer than five eligible songs, keep only actual candidates.
  return results;
}

export async function main() {
  const months = [];
  for (const period of PERIODS) {
    const [year, month] = period.split('-');
    const body = new URLSearchParams({ nationGbn: 'T', serviceGbn: 'ALL', termGbn: 'month',
      hitYear: year, targetTime: month, yearTime: '3',
      curUrl: 'circlechart.kr/page_chart/onoff.circle?serviceGbn=ALL&termGbn=month' });
    const url = 'https://circlechart.kr/data/api/chart/onoff';
    const result = { period, success: false, count: 0, tracks: [], statusCode: null, reason: null };
    try {
      const response = await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(20000),
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'MusicArchive-ChartTest/0.1 ( https://github.com/amilia12343-oss/music-archive )' } });
      result.statusCode = response.status;
      if (!response.ok) throw new Error(`HTTP ${response.status}; access not retried or bypassed`);
      const data = await response.json();
      const tracks = parseTracks(data?.List);
      result.tracks = tracks;
      result.count = tracks.length;
      // A partial response is retained for inspection, but is not TOP 100 success.
      const ranks = new Set(tracks.map((track) => track.rank));
      result.success = tracks.length === 100 && ranks.size === 100;
      if (!result.success) result.reason = `Incomplete TOP 100: ${tracks.length} entries, ${ranks.size} distinct ranks`;
    } catch (error) {
      result.reason = `${error.name}: ${error.message}${error.cause?.code ? ` (${error.cause.code})` : ''}`;
    }
    months.push(result);
    console.log(`${period}: ${result.success ? 'SUCCESS' : 'FAILED'}; count=${result.count}${result.reason ? `; ${result.reason}` : ''}`);
    // Stop on explicit access/rate restrictions; never retry or bypass them.
    if ([401, 403, 429].includes(result.statusCode)) {
      for (const skipped of PERIODS.slice(PERIODS.indexOf(period) + 1)) {
        months.push({ period: skipped, success: false, count: 0, tracks: [], statusCode: null,
          reason: `Not requested after HTTP ${result.statusCode} at ${period}` });
      }
      break;
    }
    if (period !== PERIODS.at(-1)) await sleep(1500);
  }
  const tracks = aggregateTracks(months);
  const output = { era: { startMonth: '2016-01', endMonth: '2018-12' },
    source: 'circle', chart: 'digital', scope: '종합', frequency: 'monthly',
    aggregationPolicy: 'Only successful complete months contribute; partial/failed months excluded. IDs take precedence; missing-ID rows use normalized title + artist. Equal scores preserve discovery order.',
    monthlySummary: months.map(({ tracks: entries, ...summary }) => ({ ...summary,
      includedInBaseline: summary.success, excludedEntries: summary.success ? 0 : entries.length })),
    counts: { requestedMonths: PERIODS.length,
      successfulMonths: months.filter((month) => month.success).length,
      failedMonths: months.filter((month) => !month.success).length,
      totalChartEntries: months.filter((month) => month.success).reduce((sum, month) => sum + month.tracks.length, 0),
      uniqueTracks: tracks.length }, tracks, top100: tracks.slice(0, 100),
    timeBalancedTop30: timeBalancedTop30(tracks) };
  mkdirSync(new URL('../data/circle/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../data/circle/circle-chart-2016-2018.json', import.meta.url), JSON.stringify(output, null, 2), 'utf8');
  console.log('Saved UTF-8 JSON: experiments/data/circle/circle-chart-2016-2018.json');
  if (output.counts.failedMonths) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
