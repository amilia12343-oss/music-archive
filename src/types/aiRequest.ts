import type { AiSongSuggestion } from './aiCandidate'
import type { ReconstructionCandidate } from './reconstruction'

export type AiRecommendationRequest = {
  era: { startMonth: string; endMonth: string }
  roundNumber: number
  requestedCount: number
  strongSeeds: AiSongSuggestion[]
  listenedSongs: AiSongSuggestion[]
  excludeSongs: AiSongSuggestion[]
}

// 같은 Era/session에서 표시한 후보 snapshot은 호출 측이 보관한다. 영구 schema가 아니다.
export type AiCandidateLookup = {
  eraId: string
  candidates: readonly ReconstructionCandidate[]
}

export type AiRequestBuildResult =
  | { status: 'ready'; request: AiRecommendationRequest }
  | { status: 'metadata_missing'; archiveTrackIds: string[]; candidateIds: string[] }
  | { status: 'invalid_input' | 'context_limit_exceeded' }
