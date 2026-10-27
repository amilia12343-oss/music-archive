import type { TrackInput } from './track'
import type { ReconstructionCandidate } from './reconstruction'

// 권한·identity·metadata 검토가 끝난 단일 월간 시리즈의 입력 계약. DB schema가 아니다.
// 곡 단위 발매일/차트 이력 충돌은 공급 측에서 확인·보류하고 검토 완료 데이터만 전달한다.
export type HistoricalData =
  | { status: 'failed' }
  | {
    status: 'ready'
    source: { sourceId: string; frequency: 'month' }
    tracks: ReadonlyArray<{ catalogTrackId: string; track: TrackInput }>
    entries: ReadonlyArray<{ catalogTrackId: string; month: string; rank: number }>
  }

// 외부에서 검증한 매핑이다. catalogTrackId는 현재 시리즈의 tracks에 없어도 유효하다.
// null은 전체 카탈로그 검토 결과 대응 곡 없음이며, 시리즈 부재·매핑 누락과 다르다.
export type StrongSeedCatalogMatch = {
  archiveTrackId: string
  catalogTrackId: string | null
}

export type HistoricalSelectionResult = {
  status: 'ready' | 'no_period_data' | 'no_eligible_candidates'
    | 'supply_failed' | 'seed_mapping_required' | 'invalid_input'
  candidates: ReconstructionCandidate[]
}
