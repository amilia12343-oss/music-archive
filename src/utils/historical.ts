import type { Era } from '../types/era'
import type { ReconstructionSession } from '../types/reconstruction'
import type { HistoricalData, HistoricalSelectionResult, StrongSeedCatalogMatch } from '../types/historical'
import { monthToIndex } from './date'
import { isImageUrl, isReleaseDate, isTrackAvailableForEra } from './track'

const isMonth = (value: string) => /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value)
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

// 같은 round 시작 시 한 번 호출하고 결과는 상위에서 snapshot으로 유지한다.
export function selectHistoricalCandidates({ era, session, data, seedMatches, shownCandidateIds = [] }: {
  era: Pick<Era, 'id' | 'startMonth' | 'endMonth'>
  session: ReconstructionSession
  data: HistoricalData
  seedMatches: readonly StrongSeedCatalogMatch[]
  shownCandidateIds?: readonly string[]
}): HistoricalSelectionResult {
  if (!isMonth(era.startMonth) || !isMonth(era.endMonth) || era.startMonth > era.endMonth
    || session.eraId !== era.id || !Number.isInteger(session.currentRoundNumber)
    || session.currentRoundNumber < 1) return { status: 'invalid_input', candidates: [] }
  if (data.status === 'failed') return { status: 'supply_failed', candidates: [] }
  if (!data.source.sourceId.trim() || data.source.frequency !== 'month') return { status: 'invalid_input', candidates: [] }

  const catalog = new Map(data.tracks.map((item) => [item.catalogTrackId, item.track]))
  // 중복 canonical ID는 호출 측 데이터 검토가 필요하다.
  if (catalog.size !== data.tracks.length) return { status: 'invalid_input', candidates: [] }
  const excluded = new Set([
    ...session.completedRounds.flatMap((round) => round.candidateIds), ...shownCandidateIds,
  ])
  for (const archiveId of session.strongSeedTrackIds) {
    const matches = seedMatches.filter((match) => match.archiveTrackId === archiveId)
    if (matches.length !== 1 || (matches[0].catalogTrackId !== null && !matches[0].catalogTrackId.trim())) {
      return { status: 'seed_mapping_required', candidates: [] }
    }
    // 검증된 카탈로그 매핑은 현재 시리즈의 tracks 밖을 가리킬 수도 있다.
    if (matches[0].catalogTrackId !== null) excluded.add('historical:' + matches[0].catalogTrackId)
  }

  const start = monthToIndex(era.startMonth)
  const end = monthToIndex(era.endMonth)
  const entries = data.entries.filter((entry) => isMonth(entry.month)
    && Number.isInteger(entry.rank) && entry.rank > 0
    && entry.month >= era.startMonth && entry.month <= era.endMonth)
  if (!entries.length) return { status: 'no_period_data', candidates: [] }

  const queues = new Map<number, { id: string; rank: number }[]>()
  for (const entry of entries) {
    const track = catalog.get(entry.catalogTrackId)
    if (!entry.catalogTrackId.trim() || !track?.title.trim() || !track.artist.trim()
      || excluded.has('historical:' + entry.catalogTrackId)
      // 행 단위 안전장치다. 곡 전체의 발매/차트 충돌 검토는 공급 측 계약이다.
      || !isTrackAvailableForEra(track, entry.month)) continue
    const month = monthToIndex(entry.month)
    const queue = queues.get(month) ?? []
    queue.push({ id: entry.catalogTrackId, rank: entry.rank })
    queues.set(month, queue)
  }
  for (const queue of queues.values()) queue.sort((a, b) => a.rank - b.rank || compareId(a.id, b.id))

  const monthCount = end - start + 1
  const segmentCount = Math.min(3, monthCount)
  const segments = Array.from({ length: segmentCount }, (_, index) => {
    const first = start + Math.floor(index * monthCount / segmentCount)
    const last = start + Math.floor((index + 1) * monthCount / segmentCount)
    const months = Array.from({ length: last - first }, (_, offset) => first + offset)
    const rotation = (session.currentRoundNumber - 1) % months.length
    return { months: [...months.slice(rotation), ...months.slice(0, rotation)], cursor: 0 }
  })
  const selected: string[] = []
  const seen = new Set<string>()
  const positions = new Map<number, number>()
  function take(segment: typeof segments[number]): boolean {
    for (let attempt = 0; attempt < segment.months.length; attempt++) {
      const month = segment.months[segment.cursor++ % segment.months.length]
      const queue = queues.get(month) ?? []
      let position = positions.get(month) ?? 0
      while (position < queue.length && seen.has(queue[position].id)) position++
      positions.set(month, position + 1)
      if (position < queue.length) {
        seen.add(queue[position].id)
        selected.push(queue[position].id)
        return true
      }
    }
    return false
  }
  for (let index = 0; index < segments.length; index++) {
    const quota = Math.floor(15 / segmentCount) + (index < 15 % segmentCount ? 1 : 0)
    for (let count = 0; count < quota; count++) {
      if (!take(segments[index])) break
    }
  }
  while (selected.length < 15) {
    let added = false
    for (const segment of segments) {
      if (selected.length < 15 && take(segment)) added = true
    }
    if (!added) break
  }

  const candidates = selected.map((id) => {
    const track = catalog.get(id)!
    return {
      id: 'historical:' + id,
      track: {
        title: track.title, artist: track.artist,
        ...(isImageUrl(track.albumImageUrl) ? { albumImageUrl: track.albumImageUrl } : {}),
        ...(isReleaseDate(track.releaseDate) ? { releaseDate: track.releaseDate } : {}),
      },
    }
  }).sort((a, b) => a.track.artist.localeCompare(b.track.artist, 'ko') || compareId(a.id, b.id))
  return { status: candidates.length ? 'ready' : 'no_eligible_candidates', candidates }
}
