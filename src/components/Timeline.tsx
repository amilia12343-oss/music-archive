import type { Era } from '../types/era'
import { monthToIndex } from '../utils/date'
import { assignEraLanes } from '../utils/era'

type TimelineProps = {
  birthYear: number
  currentMonthValue: string
  eras: Era[]
  selectedEraId: string | null
  onSelectEra: (eraId: string) => void
}

function Timeline({
  birthYear,
  currentMonthValue,
  eras,
  selectedEraId,
  onSelectEra,
}: TimelineProps) {
  const currentYear = Number(currentMonthValue.split('-')[0])
  const timelineStart = birthYear * 12
  const timelineEnd = monthToIndex(currentMonthValue)
  const totalMonths = timelineEnd - timelineStart + 1
  const monthWidth = 8
  const timelineCanvasWidth = totalMonths * monthWidth
  const years = Array.from(
    { length: currentYear - birthYear + 1 },
    (_, index) => birthYear + index,
  )
  const erasWithLanes = assignEraLanes(eras)
  const laneCount = erasWithLanes.length === 0
    ? 1
    : Math.max(...erasWithLanes.map(({ lane }) => lane)) + 1
  const laneHeight = 72
  const eraCanvasHeight = Math.max(250, laneCount * laneHeight + 40)

  return (
    <section className="timeline-wrapper">
      <p className="timeline-hint">시절을 선택해 곡을 기록하세요. 좌우로 스크롤하면 다른 시기를 볼 수 있습니다.</p>
      <div className="timeline-scroll">
        <div
          className="timeline-canvas"
          style={{
            width: `${timelineCanvasWidth}px`,
          }}
        >
          {/* 연도 */}
          <div className="year-row">
            {years.map((year) => {
              const yearPosition =
                (year * 12 -
                  timelineStart) *
                monthWidth

              return (
                <div
                  className="year"
                  key={year}
                  style={{
                    left: `${yearPosition}px`,
                  }}
                >
                  {year}
                </div>
              )
            })}
          </div>

          {/* Era */}
          <div
            className="era-area"
            style={{
              height: `${eraCanvasHeight}px`,
              backgroundImage:
                'linear-gradient(to right, #eeeeee 1px, transparent 1px)',
              backgroundSize:
                `${monthWidth * 12}px 100%`,
            }}
          >
            {erasWithLanes.map(
              ({ era, lane }) => {
                const eraStart =
                  monthToIndex(
                    era.startMonth,
                  )

                const eraEnd =
                  monthToIndex(
                    era.endMonth,
                  )

                const left =
                  (eraStart -
                    timelineStart) *
                  monthWidth

                const width =
                  (eraEnd -
                    eraStart +
                    1) *
                  monthWidth

                return (
                  <button
                    type="button"
                    className={`era-bar ${
                      selectedEraId === era.id
                        ? 'selected'
                        : ''
                    }`}
                    key={era.id}
                    aria-pressed={selectedEraId === era.id}
                    title={era.name}
                    onClick={() =>
                      onSelectEra(era.id)
                    }
                    style={{
                      left: `${left}px`,
                      width: `${width}px`,
                      top: `${
                        20 + lane * laneHeight
                      }px`,
                    }}
                  >
                    {era.name}
                  </button>
                )
              },
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default Timeline
