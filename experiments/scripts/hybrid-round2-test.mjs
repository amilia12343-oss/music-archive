// Experiment only. Existing scripts are imported behind their main guards, not executed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';
import { seeds, normalize, resolveSeed, releaseCategory } from './recommendation-test.mjs';
import { keyOf as originalKey } from './hybrid-recommendation-test.mjs';

setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);
const ERA = { startMonth: '2016-01', endMonth: '2018-12' };
const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const label = ({ title, artist }) => `${artist} - ${title}`;
const positive = (row) => ['CONFIRMED_LISTENED', 'RECALLED_AFTER_PROMPT'].includes(row.status);

// Known Round 1 translations only; preserve the existing explicit aliases first.
// Never infer identity by deleting parentheses, collaborators or version suffixes.
const round1Aliases = [
  [['어디에도', 'No Matter Where'], ['엠씨더맥스 (M.C the MAX)', 'M.C the MAX', 'MC THE MAX']],
  [['시간을 달려서 (Rough)', '시간을 달려서', 'Rough'], ['여자친구 (GFRIEND)', 'GFRIEND', '여자친구']],
  [['너는 나 나는 너', 'I Am You, You Are Me'], ['지코 (ZICO)', 'ZICO', '지코']],
  [['널 사랑하지 않아', "I Don't Love You"], ['어반 자카파 (Urban Zakapa)', 'Urban Zakapa', '어반자카파']],
  [['이 소설의 끝을 다시 써보려 해', 'Making a New Ending for This Story'], ['한동근', 'Han Dong Geun']],
  [['Day Day (Feat. 박재범) (Prod. by GRAY)', 'Day Day (feat. Jay Park)', 'Day Day'], ['비와이(BewhY)', 'BewhY', '비와이']],
  [['첫눈처럼 너에게 가겠다', 'I Will Go to You Like the First Snow'], ['에일리 (Ailee)', 'Ailee', '에일리']],
  [['좋다고 말해', 'Tell Me You Love Me'], ['볼빨간사춘기', 'BOL4', 'Bolbbalgan4']],
  [['오랜 날 오랜 밤', 'Last Goodbye'], ['AKMU (악뮤)', 'AKMU', '악동뮤지션', 'Akdong Musician']],
  [['좋니', 'Like It'], ['윤종신', 'Yoon Jong Shin']],
  [['비도 오고 그래서 (Feat. 신용재)', "You, Clouds, Rain", 'You, Clouds, Rain (feat. Shin Yong Jae)'], ['헤이즈 (Heize)', 'Heize', '헤이즈']],
  [['밤편지', 'Through the Night'], ['아이유 (IU)', 'IU', '아이유']],
  [['그날처럼', 'Good Old Days'], ['장덕철', 'Jang Deok Cheol']],
  [['뿜뿜', 'BBoom BBoom'], ['모모랜드 (MOMOLAND)', 'MOMOLAND', '모모랜드']],
  [['선물', 'Gift'], ['멜로망스(Melomance)', 'Melomance', '멜로망스']],
  [['모든 날, 모든 순간 (Every day, Every Moment)', '모든 날, 모든 순간', 'Every day, Every Moment'], ['폴킴', 'Paul Kim']],
  [['뚜두뚜두 (DDU-DU DDU-DU)', '뚜두뚜두', 'DDU-DU DDU-DU'], ['BLACKPINK', '블랙핑크']],
  [['열애중', 'Love, ing'], ['벤 (Ben)', 'Ben', '벤']],
  [['봄날', 'Spring Day'], ['방탄소년단', 'BTS']],
  [['DNA'], ['방탄소년단', 'BTS']],
  [['우주를 줄게', 'Galaxy'], ['볼빨간사춘기', 'BOL4', 'Bolbbalgan4']],
  [['마지막처럼', "AS IF IT'S YOUR LAST"], ['BLACKPINK', '블랙핑크']],
  [['나만 안되는 연애', '나만 안 되는 연애', 'Hard to Love'], ['볼빨간사춘기', 'BOL4', 'Bolbbalgan4']],
  [['하루하루', 'Haru Haru'], ['BIGBANG', 'BIGBANG (빅뱅)', '빅뱅']],
  [['Energetic', '에너제틱', '에너제틱 (Energetic)'], ['Wanna One', 'Wanna One (워너원)', '워너원']],
  [['Shine', '빛나리'], ['Pentagon', '펜타곤']],
  [['천국', 'Heaven'], ['BIGBANG', 'BIGBANG (빅뱅)', '빅뱅']],
];
const aliases = new Map();
for (const [titles, artists] of round1Aliases) {
  const canonical = originalKey({ title: titles[0], artist: artists[0] });
  for (const title of titles) for (const artist of artists) aliases.set(originalKey({ title, artist }), canonical);
}
export const keyOf = (song) => aliases.get(originalKey(song)) ?? originalKey(song);

export function validateFeedback(round1, feedback) {
  if (round1.candidates?.length !== 30 || feedback.feedback?.length !== 30) throw new Error('Round 1 and feedback must have 30 rows');
  const statuses = { 1: 'CONFIRMED_LISTENED', 2: 'KNOWN_NOT_LISTENED', 3: 'RECALLED_AFTER_PROMPT', 4: 'UNKNOWN' };
  for (const data of [round1, feedback]) {
    if (data.era?.startMonth !== ERA.startMonth || data.era?.endMonth !== ERA.endMonth) throw new Error('Input Era mismatch');
  }
  const ranks = new Set();
  for (const row of feedback.feedback) {
    const shown = round1.candidates.find((song) => song.rank === row.rank);
    if (!shown || ranks.has(row.rank) || keyOf(shown) !== keyOf(row) || statuses[row.value] !== row.status) {
      throw new Error('Feedback rank/identity/status does not match Round 1');
    }
    ranks.add(row.rank);
  }
  return feedback.feedback.filter(positive);
}

export function mergeSimilar(responses, excluded) {
  const pool = new Map();
  for (const { response, seed } of responses) {
    for (const track of response?.tracks ?? []) {
      if (typeof track?.name !== 'string' || !track.name.trim()
        || typeof track.artist?.name !== 'string' || !track.artist.name.trim()) continue;
      const match = Number(track.match);
      if (track.match == null || track.match === '' || !Number.isFinite(match) || match < 0) continue;
      const song = { title: track.name.trim(), artist: track.artist.name.trim() };
      const key = keyOf(song);
      if (excluded.has(key)) continue;
      let candidate = pool.get(key);
      if (!candidate) { candidate = { ...song, similarity: match, sources: new Map() }; pool.set(key, candidate); }
      candidate.similarity = Math.max(candidate.similarity, match);
      candidate.sources.set(label(seed), Math.max(candidate.sources.get(label(seed)) ?? -Infinity, match));
    }
  }
  return [...pool.values()].sort((a, b) => b.similarity - a.similarity);
}

async function enrichDates(pool) {
  // Same iTunes policy as Round 1: exact normalized title+artist, earliest observed date.
  // Two workers, one start every 3100ms; no pagination, alias queries or retries.
  let index = 0;
  let nextStart = Date.now();
  async function worker() {
    while (index < pool.length) {
      const song = pool[index++];
      const start = Math.max(Date.now(), nextStart);
      nextStart = start + 3100;
      await sleep(Math.max(0, start - Date.now()));
      try {
        const params = new URLSearchParams({ term: `${song.artist} ${song.title}`, media: 'music', entity: 'song', limit: '25' });
        const response = await fetch(`https://itunes.apple.com/search?${params}`, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.results)) throw new Error('Missing iTunes results');
        const dates = data.results.filter((item) => item.kind === 'song'
          && typeof item.trackName === 'string' && typeof item.artistName === 'string'
          && normalize(item.trackName) === normalize(song.title) && normalize(item.artistName) === normalize(song.artist))
          .map((item) => item.releaseDate).filter((date) => releaseCategory(date) !== 'Unknown').sort();
        song.releaseDate = dates[0]?.slice(0, 10);
        song.matching = dates.length ? 'Exact normalized match; earliest observed iTunes listing' : 'Unknown: no exact dated match';
      } catch (error) { song.matching = `Unknown: iTunes ${error.message}`; }
    }
  }
  await Promise.all([worker(), worker()]);
}

export function buildRound2(circle, round1, feedback, pool, reports) {
  const positives = validateFeedback(round1, feedback);
  const positiveLabels = new Set(positives.map(label));
  const excluded = new Set([...seeds, ...round1.candidates].map(keyOf));
  const selected = new Set();
  const candidates = [];
  let duplicateSkipCount = 0;
  const global = [...circle.tracks].sort((a, b) => b.eraScore - a.eraScore);
  const chart = new Map();
  for (const song of global) if (!chart.has(keyOf(song))) chart.set(keyOf(song), song);
  const eligible = (song) => {
    const key = keyOf(song);
    if (excluded.has(key)) return false;
    if (selected.has(key)) { duplicateSkipCount++; return false; }
    return true;
  };
  function add(song, primarySource, details = {}) {
    selected.add(keyOf(song));
    candidates.push({ title: song.title, artist: song.artist, primarySource,
      eraScore: chart.get(keyOf(song))?.eraScore ?? null, ...details });
  }
  for (let i = 0; i < 6; i++) {
    const year = 2016 + Math.floor(i / 2);
    const segment = { startMonth: `${year}-${i % 2 ? '07' : '01'}`, endMonth: `${year}-${i % 2 ? '12' : '06'}` };
    const entries = new Map();
    for (const song of circle.tracks) {
      if (excluded.has(keyOf(song))) continue;
      for (const { period, rank } of song.chartHistory) {
        if (period < segment.startMonth || period > segment.endMonth) continue;
        if (!entries.has(keyOf(song))) entries.set(keyOf(song), { song, ranks: new Map() });
        const entry = entries.get(keyOf(song));
        entry.ranks.set(period, Math.min(entry.ranks.get(period) ?? Infinity, rank));
      }
    }
    const ranked = [...entries.values()].map(({ song, ranks }) => ({ song,
      segmentScore: [...ranks.values()].reduce((sum, rank) => sum + 101 - rank, 0) }))
      .sort((a, b) => b.segmentScore - a.segmentScore);
    let count = 0;
    for (const entry of ranked) {
      if (!eligible(entry.song)) continue;
      add(entry.song, 'ERA_CHART_BALANCED', { segment, segmentScore: entry.segmentScore });
      if (++count === 3) break;
    }
    if (count !== 3) throw new Error(`Insufficient balanced candidates for ${segment.startMonth}`);
  }
  function fillGlobal(count, source) {
    let added = 0;
    for (const song of global) {
      if (added === count) break;
      if (!eligible(song)) continue;
      add(song, source); added++;
    }
    if (added !== count) throw new Error('Insufficient global candidates');
  }
  fillGlobal(6, 'ERA_CHART_GLOBAL');
  const usable = pool.filter((song) => releaseCategory(song.releaseDate) !== 'Future' && !excluded.has(keyOf(song)));
  const queues = positives.map((seed) => {
    const sourceSeed = label(seed);
    return { sourceSeed, count: 0, songs: usable.filter((song) => song.sources.has(sourceSeed))
      .sort((a, b) => b.sources.get(sourceSeed) - a.sources.get(sourceSeed)) };
  }).filter((queue) => queue.songs.length)
    .sort((a, b) => b.songs[0].sources.get(b.sourceSeed) - a.songs[0].sources.get(a.sourceSeed));
  let similarCount = 0;
  for (let round = 0; round < 2 && similarCount < 6; round++) {
    for (const queue of queues) {
      if (similarCount === 6) break;
      while (queue.songs.length && queue.count < 2) {
        const song = queue.songs.shift();
        if (!eligible(song)) continue;
        add(song, 'FEEDBACK_SIMILAR', { sourceSeed: queue.sourceSeed,
          similarity: song.sources.get(queue.sourceSeed), seedOrigin: 'ROUND1_CONFIRMED',
          releaseDate: song.releaseDate ?? 'Unknown', matching: song.matching ?? 'Unknown' });
        queue.count++; similarCount++; break;
      }
    }
  }
  fillGlobal(6 - similarCount, 'ERA_CHART_GLOBAL_FALLBACK');
  const ranked = candidates.map((song, index) => ({ rank: index + 1, ...song }));
  if (ranked.length !== 30 || new Set(ranked.map(keyOf)).size !== 30
    || ranked.some((song) => excluded.has(keyOf(song)))
    || ranked.some((song) => song.primarySource === 'FEEDBACK_SIMILAR' && !positiveLabels.has(song.sourceSeed))) {
    throw new Error('Round 2 output invariant failed');
  }
  return { era: ERA,
    datePolicy: 'Earliest exact-match iTunes listing, not verified original release; absent/failed date match allowed as Unknown.',
    feedbackSeedReports: reports,
    summary: { totalCandidates: ranked.length,
      sourceCounts: Object.fromEntries(['ERA_CHART_BALANCED', 'ERA_CHART_GLOBAL', 'FEEDBACK_SIMILAR', 'ERA_CHART_GLOBAL_FALLBACK']
        .map((source) => [source, ranked.filter((song) => song.primarySource === source).length])),
      originalSeedIdentityCount: seeds.length, round1ShownCount: round1.candidates.length,
      round1PositiveCount: positives.length,
      round1KnownNotListenedCount: feedback.feedback.filter((row) => row.status === 'KNOWN_NOT_LISTENED').length,
      round1UnknownCount: feedback.feedback.filter((row) => row.status === 'UNKNOWN').length,
      feedbackSeedsTried: reports.length, feedbackSeedsWithSimilar: reports.filter((row) => row.success).length,
      similarCandidateCount: usable.length, similarShortfall: 6 - similarCount, duplicateSkipCount }, candidates: ranked };
}

export async function main() {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) throw new Error('Set LASTFM_API_KEY before running.');
  const circle = read('data/circle/circle-chart-2016-2018.json');
  const round1 = read('results/hybrid/hybrid-recommendation-2016-2018.json');
  const feedback = read('data/hybrid/hybrid-round1-feedback.json');
  const positives = validateFeedback(round1, feedback);
  if (circle.era?.startMonth !== ERA.startMonth || circle.era?.endMonth !== ERA.endMonth) throw new Error('Circle Era mismatch');
  const excluded = new Set([...seeds, ...round1.candidates].map(keyOf));
  const responses = [];
  const reports = [];
  for (const seed of positives) {
    // Original helper: direct autocorrect getSimilar, exact search on zero, one retry.
    const result = await resolveSeed(seed, apiKey);
    responses.push({ seed, response: result.response });
    reports.push(result.report);
    console.log(`${label(seed)}: ${result.report.success ? 'SUCCESS' : 'FAILED'}`);
    await sleep(300);
  }
  // Reserve top candidates per successful source, preventing the date budget from
  // being monopolized by one source. At most 10 per source, deduplicated globally.
  const merged = mergeSimilar(responses, excluded);
  const pool = [];
  const included = new Set();
  for (const seed of positives) {
    for (const song of merged.filter((entry) => entry.sources.has(label(seed)))
      .sort((a, b) => b.sources.get(label(seed)) - a.sources.get(label(seed))).slice(0, 10)) {
      if (!included.has(keyOf(song))) { included.add(keyOf(song)); pool.push(song); }
    }
  }
  console.log(`Date checks: ${pool.length} candidates; up to ${positives.length * 10} iTunes requests, no retries.`);
  await enrichDates(pool);
  const output = buildRound2(circle, round1, feedback, pool, reports);
  mkdirSync(new URL('../results/hybrid/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../results/hybrid/hybrid-round2-2016-2018.json', import.meta.url), JSON.stringify(output, null, 2), 'utf8');
  for (const song of output.candidates) console.log(`${song.rank}. ${song.title} - ${song.artist} [${song.primarySource}]`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
