import type { Era } from '../types/era'
import type { Track } from '../types/track'
import type { ReconstructionSession, ReconstructionStatus } from '../types/reconstruction'
import type { AiSongSuggestion } from '../types/aiCandidate'
import type { AiCandidateLookup, AiRecommendationRequest, AiRequestBuildResult } from '../types/aiRequest'

const isMonth = (month: string) => /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)
const songKey = (song: AiSongSuggestion) => JSON.stringify([song.title, song.artist]
  .map((value) => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ')))

// 공급자 prompt/API가 아닌 ID를 조회한 최소 요청 데이터만 반환한다.
export function buildAiRecommendationRequest({ era, session, archiveTracks, candidateLookup,
  requestedCount, shownCandidateIds = [] }: {
  era: Pick<Era, 'id' | 'startMonth' | 'endMonth'>
  session: ReconstructionSession
  archiveTracks: readonly Track[]
  candidateLookup: AiCandidateLookup
  requestedCount: number
  shownCandidateIds?: readonly string[]
}): AiRequestBuildResult {
  if (session.eraId !== era.id || candidateLookup.eraId !== era.id
    || !isMonth(era.startMonth) || !isMonth(era.endMonth) || era.startMonth > era.endMonth
    || !Number.isInteger(session.currentRoundNumber) || session.currentRoundNumber < 1
    || !Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 30) {
    return { status: 'invalid_input' }
  }

  const shown = new Set(shownCandidateIds)
  const statuses = new Map<string, ReconstructionStatus>()
  const roundNumbers = new Set<number>()
  // 마지막 명시적 응답을 사용하도록 배열 순서가 아닌 round 순서로 읽는다.
  for (const round of [...session.completedRounds].sort((a, b) => a.roundNumber - b.roundNumber)) {
    if (!Number.isInteger(round.roundNumber) || round.roundNumber < 1
      || round.roundNumber >= session.currentRoundNumber || roundNumbers.has(round.roundNumber)) {
      return { status: 'invalid_input' }
    }
    roundNumbers.add(round.roundNumber)
    const roundIds = new Set(round.candidateIds)
    round.candidateIds.forEach((id) => shown.add(id))
    const responded = new Set<string>()
    for (const response of round.responses) {
      if (!roundIds.has(response.candidateId) || responded.has(response.candidateId)
        || !['LISTENED', 'NOT_LISTENED', 'UNASSIGNED'].includes(response.status)) {
        return { status: 'invalid_input' }
      }
      responded.add(response.candidateId)
      statuses.set(response.candidateId, response.status)
    }
  }
  const seedIds = new Set(session.strongSeedTrackIds)
  if ([...seedIds, ...shown].some((id) => !id.trim())) return { status: 'invalid_input' }

  const missingSeeds: string[] = []
  const missingCandidates: string[] = []
  const seedSongs: AiSongSuggestion[] = []
  const shownSongs: AiSongSuggestion[] = []
  const listenedSongs: AiSongSuggestion[] = []
  let invalid = false
  let tooLong = false
  function copySong(track: AiSongSuggestion): AiSongSuggestion | null {
    if (!track.title.trim() || !track.artist.trim()) { invalid = true; return null }
    if (track.title.length > 200 || track.artist.length > 200) { tooLong = true; return null }
    return { title: track.title.trim(), artist: track.artist.trim() }
  }
  for (const id of seedIds) {
    const matches = archiveTracks.filter((track) => track.id === id)
    if (!matches.length) { missingSeeds.push(id); continue }
    if (matches.length !== 1) { invalid = true; continue }
    const song = copySong(matches[0])
    if (song) seedSongs.push(song)
  }
  for (const id of shown) {
    const matches = candidateLookup.candidates.filter((candidate) => candidate.id === id)
    if (!matches.length) { missingCandidates.push(id); continue }
    if (matches.length !== 1) { invalid = true; continue }
    const song = copySong(matches[0].track)
    if (song) {
      shownSongs.push(song)
      if (statuses.get(id) === 'LISTENED') listenedSongs.push(song)
    }
  }
  if (invalid) return { status: 'invalid_input' }
  if (tooLong) return { status: 'context_limit_exceeded' }
  if (missingSeeds.length || missingCandidates.length) {
    return { status: 'metadata_missing', archiveTrackIds: missingSeeds, candidateIds: missingCandidates }
  }
  function unique(songs: AiSongSuggestion[]): AiSongSuggestion[] {
    const seen = new Set<string>()
    return songs.filter((song) => {
      const key = songKey(song)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const request: AiRecommendationRequest = {
    era: { startMonth: era.startMonth, endMonth: era.endMonth },
    roundNumber: session.currentRoundNumber,
    requestedCount,
    strongSeeds: unique(seedSongs),
    listenedSongs: unique(listenedSongs),
    excludeSongs: unique([...seedSongs, ...shownSongs]),
  }
  // 이력을 조용히 자르지 않고 상위에서 예산/요약 정책을 결정하도록 보류한다.
  if (JSON.stringify(request).length > 16000) return { status: 'context_limit_exceeded' }
  return { status: 'ready', request }
}
