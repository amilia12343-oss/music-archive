import type { Era } from '../types/era'

type EraDetailProps = {
  era: Era
  onEdit: (era: Era) => void
}

function EraDetail({ era, onEdit }: EraDetailProps) {
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
    </section>
  )
}

export default EraDetail
