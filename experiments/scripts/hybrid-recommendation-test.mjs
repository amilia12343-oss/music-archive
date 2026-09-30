// Offline experiment: read saved results only; never fetch or write app data.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { seeds, normalize, releaseCategory } from './recommendation-test.mjs';

// Explicit aliases for this experiment only; no fuzzy matching or suffix stripping.
export const seedAliases = [
  { artists: ['BIGBANG', '빅뱅', 'BIGBANG (빅뱅)', '빅뱅(BIGBANG)'], titles: ['거짓말', 'Lies', '거짓말 (Lies)'] },
  { artists: ['리쌍', 'Leessang'], titles: ['광대', 'Clown', 'The Clown', '광대 (Clown)'] },
  { artists: ['TWICE', '트와이스', '트와이스(TWICE)', '트와이스 (TWICE)'], titles: ['CHEER UP'] },
  { artists: ['볼빨간사춘기', 'BOL4', 'Bolbbalgan4', 'Bolbbalgan Sachungi'], titles: ['심술', 'Grumpy', '심술 (Grumpy)'] },
  { artists: ['박원', 'Park Won'], titles: ['노력', 'Try', 'Effort', '노력 (Try)'] },
  { artists: ['WINNER', '위너', '위너(WINNER)', '위너 (WINNER)'], titles: ['REALLY REALLY'] },
  { artists: ['IU', '아이유', '아이유 (IU)', '아이유(IU)'], titles: ['가을 아침', 'Autumn Morning', '가을 아침 (Autumn Morning)'] },
  { artists: ['넉살', 'Nucksal', '넉살, 한해, 조우찬, 라이노'], titles: ['N분의1', 'N분의 1', 'N분의 1 (Feat. 다이나믹듀오)', '1/N'] },
  { artists: ['BTOB', '비투비', '비투비 (BTOB)', '비투비(BTOB)'], titles: ['그리워하다', 'Missing You', '그리워하다 (Missing You)'] },
  { artists: ['HAON(김하온)', 'HAON', '김하온', '김하온 (HAON)', '김하온(HAON)'], titles: ['붕붕', '붕붕 (Feat. Sik-K) (Prod. GroovyRoom)', '붕붕 (Feat. Sik-K)', 'Boong Boong', 'Boong Boong (Feat. Sik-K)'] },
  { artists: ['SHAUN', '숀', '숀 (SHAUN)', '숀(SHAUN)'], titles: ['Way Back Home'] },
  { artists: ['iKON', '아이콘', '아이콘 (iKON)', '아이콘(iKON)'], titles: ['사랑을 했다', '사랑을 했다 (LOVE SCENARIO)', 'LOVE SCENARIO'] },
];
const artistAliases = new Map();
for (const group of seedAliases) {
  for (const artist of group.artists) artistAliases.set(normalize(artist), normalize(group.artists[0]));
}
// Known non-Seed translations present in the comparison data.
const candidateAliases = [
  { artists: ['BIGBANG'], titles: ['에라 모르겠다', 'FXXK IT'] },
  { artists: ['BIGBANG'], titles: ['맨정신', '맨정신 (SOBER)', 'SOBER'] },
  { artists: ['TWICE'], titles: ['OOH-AHH하게', 'Like OOH-AHH'] },
  { artists: ['iKON'], titles: ['죽겠다 (KILLING ME)', '죽겠다', 'KILLING ME'] },
  { artists: ['Wanna One', '워너원', '워너원 (Wanna One)'], titles: ['Energetic', '에너제틱 (Energetic)', '에너제틱'] },
  { artists: ['SUNMI', '선미'], titles: ['Gashina', '가시나'] },
  { artists: ['MAMAMOO', '마마무'], titles: ['Starry Night', '별이 빛나는 밤'] },
];
for (const group of candidateAliases) {
  for (const artist of group.artists) artistAliases.set(normalize(artist), normalize(group.artists[0]));
}
const songAliases = new Map();
for (const group of [...seedAliases, ...candidateAliases]) {
  const canonicalArtist = artistAliases.get(normalize(group.artists[0]));
  for (const artist of group.artists) for (const title of group.titles) {
    songAliases.set(JSON.stringify([normalize(title), normalize(artist)]),
      JSON.stringify([normalize(group.titles[0]), canonicalArtist]));
  }
}
export const keyOf = ({ title, artist }) => songAliases.get(JSON.stringify([normalize(title), normalize(artist)]))
  ?? JSON.stringify([normalize(title), artistAliases.get(normalize(artist)) ?? normalize(artist)]);
const seedLabel = ({ title, artist }) => `${artist} - ${title}`;
const ERA = { startMonth: '2016-01', endMonth: '2018-12' };

export function buildHybrid(circle, lastfm) {
  for (const data of [circle, lastfm]) {
    if (data.era?.startMonth !== ERA.startMonth || data.era?.endMonth !== ERA.endMonth) {
      throw new Error('Input Era must be 2016-01 through 2018-12');
    }
  }
  if (!Array.isArray(circle.tracks) || !Array.isArray(lastfm.rawSimilar)
    || !Array.isArray(lastfm.eraAware)) throw new Error('Missing saved candidate arrays');
  const excluded = new Set(seeds.map(keyOf));
  const excludedSeen = new Set();
  const selected = new Set();
  const candidates = [];
  let duplicateSkipCount = 0;
  function eligible(song) {
    const key = keyOf(song);
    if (excluded.has(key)) { excludedSeen.add(key); return false; }
    if (selected.has(key)) { duplicateSkipCount++; return false; }
    return true;
  }
  const global = [...circle.tracks].sort((a, b) => b.eraScore - a.eraScore);
  const circleByName = new Map();
  for (const song of global) if (!circleByName.has(keyOf(song))) circleByName.set(keyOf(song), song);
  function add(song, primarySource, details = {}) {
    const key = keyOf(song);
    selected.add(key);
    candidates.push({ title: song.title, artist: song.artist, primarySource,
      eraScore: circleByName.get(key)?.eraScore ?? null, ...details });
  }

  for (let segmentIndex = 0; segmentIndex < 6; segmentIndex++) {
    const year = 2016 + Math.floor(segmentIndex / 2);
    const segment = { startMonth: `${year}-${segmentIndex % 2 ? '07' : '01'}`,
      endMonth: `${year}-${segmentIndex % 2 ? '12' : '06'}` };
    const pool = new Map();
    for (const song of circle.tracks) {
      const history = song.chartHistory.filter(({ period }) =>
        period >= segment.startMonth && period <= segment.endMonth);
      if (!history.length) continue;
      const key = keyOf(song);
      if (!pool.has(key)) pool.set(key, { song, ranks: new Map() });
      const entry = pool.get(key);
      // Same title/artist under multiple IDs contributes once per month at best rank.
      for (const { period, rank } of history) entry.ranks.set(period, Math.min(entry.ranks.get(period) ?? Infinity, rank));
    }
    const ranked = [...pool.values()].map(({ song, ranks }) => ({ song,
      segmentScore: [...ranks.values()].reduce((sum, rank) => sum + 101 - rank, 0) }))
      .sort((a, b) => b.segmentScore - a.segmentScore);
    let count = 0;
    for (const { song, segmentScore } of ranked) {
      if (!eligible(song)) continue;
      add(song, 'ERA_CHART_BALANCED', { segment, segmentScore });
      if (++count === 3) break;
    }
  }
  function fillGlobal(count) {
    let added = 0;
    for (const song of global) {
      if (added >= count) break;
      if (!eligible(song)) continue;
      add(song, 'ERA_CHART_GLOBAL');
      added++;
    }
  }
  fillGlobal(6);

  // The saved file contains two truncated views, not the full Last.fm candidate pool.
  // Union both views to preserve every available evaluated candidate.
  const similar = new Map();
  for (const song of [...lastfm.rawSimilar, ...lastfm.eraAware]) {
    if (releaseCategory(song.releaseDate) === 'Future' || song.category === 'Future') continue;
    if (!eligible(song)) continue;
    const key = keyOf(song);
    let entry = similar.get(key);
    if (!entry) { entry = { song, sources: new Map() }; similar.set(key, entry); }
    // Parse the existing "artist - title [match] / ..." provenance without aliases.
    for (const source of String(song.recommendedBy ?? '').split(' / ')) {
      for (const seed of seeds) {
        const label = seedLabel(seed);
        const prefix = `${label} [`;
        if (!source.startsWith(prefix) || !source.endsWith(']')) continue;
        const score = Number(source.slice(prefix.length, -1));
        if (!Number.isFinite(score) || score < 0) continue;
        entry.sources.set(label, Math.max(entry.sources.get(label) ?? -Infinity, score));
      }
    }
  }
  const queues = seeds.map((seed) => {
    const label = seedLabel(seed);
    const songs = [...similar.values()].filter((entry) => entry.sources.has(label))
      .sort((a, b) => b.sources.get(label) - a.sources.get(label));
    return { label, songs, count: 0 };
  }).filter((queue) => queue.songs.length)
    .sort((a, b) => b.songs[0].sources.get(b.label) - a.songs[0].sources.get(a.label));
  let similarCount = 0;
  for (let round = 0; round < 2 && similarCount < 6; round++) {
    for (const queue of queues) {
      if (similarCount >= 6) break;
      while (queue.songs.length && queue.count < 2) {
        const entry = queue.songs.shift();
        if (!eligible(entry.song)) continue;
        add(entry.song, 'SEED_SIMILAR', { sourceSeed: queue.label,
          similarity: entry.sources.get(queue.label) });
        queue.count++;
        similarCount++;
        break;
      }
    }
  }
  fillGlobal(6 - similarCount);
  const ranked = candidates.map((song, index) => ({ rank: index + 1, ...song }));
  return { era: ERA,
    inputs: { circle: 'circle-chart-2016-2018.json', lastfm: 'recommendation-fallback-output.json' },
    policy: 'Balanced segments first, then global chart, then round-robin similar Seeds (max 2 each); missing similar slots filled by global chart. Explicit experiment aliases only. Circle eraScore uses highest existing same-identity ID score; segment histories merge monthly best ranks.',
    summary: { totalCandidates: ranked.length,
      sourceCounts: Object.fromEntries(['ERA_CHART_BALANCED', 'ERA_CHART_GLOBAL', 'SEED_SIMILAR']
        .map((source) => [source, ranked.filter((song) => song.primarySource === source).length])),
      seedIdentityCount: seedAliases.length,
      excludedSeedCount: excludedSeen.size,
      excludedSeedCountMeaning: 'Distinct Seed identities encountered and excluded during candidate selection; not excluded row count or total configured Seeds.',
      duplicateSkipCount,
      lastfmSuccessfulSeedCount: lastfm.seedSummary?.finalSuccess
        ?? lastfm.seedSummary?.reports?.filter((report) => report.success).length ?? 0 },
    candidates: ranked };
}

export function main() {
  const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
  const output = buildHybrid(read('data/circle/circle-chart-2016-2018.json'), read('results/lastfm/recommendation-fallback-output.json'));
  mkdirSync(new URL('../results/hybrid/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../results/hybrid/hybrid-recommendation-2016-2018.json', import.meta.url), JSON.stringify(output, null, 2), 'utf8');
  for (const song of output.candidates) console.log(`${song.rank}. ${song.title} - ${song.artist} [${song.primarySource}]`);
  if (output.candidates.length < 30) console.log(`Only ${output.candidates.length} eligible candidates in saved data; no fabricated refill.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
