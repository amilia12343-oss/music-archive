import type { TrackInput } from './track'

export type ReconstructionCandidate = {
  // 생성자는 round 간 비교 가능한 안정적 후보 ID를 제공한다. 영구 Track ID는 아니다.
  id: string
  track: TrackInput
}

export type ReconstructionStatus = 'LISTENED' | 'UNASSIGNED' | 'NOT_LISTENED'

export type CandidateResponse = {
  candidateId: string
  status: ReconstructionStatus
}

export type ReconstructionRoundResult = {
  roundNumber: number
  // 미평가 후보도 표시 이력에 포함한다. 영구 Track ID가 아니다.
  candidateIds: string[]
  responses: CandidateResponse[]
}

export type ReconstructionSession = {
  eraId: string
  strongSeedTrackIds: string[]
  currentRoundNumber: number
  completedRounds: ReconstructionRoundResult[]
}
