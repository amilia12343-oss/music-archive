import type { Era } from '../types/era'
import type { Track } from '../types/track'
import EraTracks from './EraTracks'

type EraDetailProps = {
  era: Era
  onEdit: (era: Era) => void
  tracks: Track[]
  onAddTrack: (title: string, artist: string) => void
  onRemoveTrack: (trackId: string) => void
}

function EraDetail({ era, onEdit, tracks, onAddTrack, onRemoveTrack }: EraDetailProps) {
  return (
    <section className="era-detail">
      <h2>{era.name}</h2>

      <p>
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
          수정
        </button>
      </div>
      <EraTracks key={era.id} tracks={tracks} onAdd={onAddTrack} onRemove={onRemoveTrack} />
    </section>
  )
}

export default EraDetail
