import type { Era } from '../types/era'
import type { Track, TrackInput } from '../types/track'
import EraTracks from './EraTracks'

type EraDetailProps = {
  era: Era
  onEdit: (era: Era) => void
  tracks: Track[]
  onAddTrack: (input: TrackInput) => void
  onRemoveTrack: (trackId: string) => void
  onStartReconstruction: () => void
  confirmedSeedCount: number
}

function EraDetail({ era, onEdit, tracks, onAddTrack, onRemoveTrack, onStartReconstruction, confirmedSeedCount }: EraDetailProps) {
  return (
    <section className="era-detail">
      <h2>{era.name}</h2>

      <p className="era-period">
        {era.startMonth}
        {' ~ '}
        {era.endMonth}
      </p>

      {era.description && (
        <p>
          {era.description}
        </p>
      )}

      <div className="era-detail-actions">
        <button
          type="button"
          onClick={() =>
            onEdit(era)
          }
        >
          시절 수정
        </button>
      </div>
      <p><button type="button" onClick={onStartReconstruction}>기억 복원 시작</button></p>
      {confirmedSeedCount > 0 && <p role="status">대표곡 {confirmedSeedCount}곡 선택을 완료했습니다. 기억 복원 추천 화면은 준비 중입니다.</p>}
      <EraTracks key={era.id} endMonth={era.endMonth} tracks={tracks} onAdd={onAddTrack} onRemove={onRemoveTrack} />
    </section>
  )
}

export default EraDetail
