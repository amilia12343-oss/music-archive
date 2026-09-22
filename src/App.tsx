import { useState } from 'react'
import type { FormEvent } from 'react'

import './styles/onboarding.css'
import './styles/timeline.css'
import './styles/modal.css'

type UserProfile = {
  id: string
  birthYear: number
}

type Era = {
  id: string
  name: string
  startMonth: string
  endMonth: string
  description?: string
  origin: 'AUTO_SCHOOL' | 'CUSTOM'
  schoolStage?: 'ELEMENTARY' | 'MIDDLE' | 'HIGH'
}

function createSchoolEras(
  birthYear: number,
  currentMonthValue: string,
): Era[] {
  const elementaryStart = birthYear + 7
  const middleStart = birthYear + 13
  const highStart = birthYear + 16

  const schoolEras: Era[] = [
    {
      id: 'school-elementary',
      name: '초등학생',
      startMonth: `${elementaryStart}-03`,
      endMonth: `${middleStart}-02`,
      origin: 'AUTO_SCHOOL',
      schoolStage: 'ELEMENTARY',
    },
    {
      id: 'school-middle',
      name: '중학생',
      startMonth: `${middleStart}-03`,
      endMonth: `${highStart}-02`,
      origin: 'AUTO_SCHOOL',
      schoolStage: 'MIDDLE',
    },
    {
      id: 'school-high',
      name: '고등학생',
      startMonth: `${highStart}-03`,
      endMonth: `${highStart + 3}-02`,
      origin: 'AUTO_SCHOOL',
      schoolStage: 'HIGH',
    },
  ]

  return schoolEras
    .filter((era) => {
      // 아직 시작하지 않은 학교 Era는 생성하지 않는다.
      return era.startMonth <= currentMonthValue
    })
    .map((era) => {
      // 학교 과정이 아직 진행 중이라면
      // 종료 시점을 현재 월로 설정한다.
      if (era.endMonth > currentMonthValue) {
        return {
          ...era,
          endMonth: currentMonthValue,
        }
      }

      return era
    })
}

function monthToIndex(value: string): number {
  const [year, month] = value
    .split('-')
    .map(Number)

  return year * 12 + (month - 1)
}

type EraWithLane = {
  era: Era
  lane: number
}

function assignEraLanes(eras: Era[]): EraWithLane[] {
  const sortedEras = [...eras].sort((a, b) => {
    return (
      monthToIndex(a.startMonth) -
      monthToIndex(b.startMonth)
    )
  })

  const laneEndMonths: number[] = []

  return sortedEras.map((era) => {
    const eraStart = monthToIndex(era.startMonth)
    const eraEnd = monthToIndex(era.endMonth)

    let assignedLane = -1

    for (
      let lane = 0;
      lane < laneEndMonths.length;
      lane++
    ) {
      if (eraStart > laneEndMonths[lane]) {
        assignedLane = lane
        break
      }
    }

    if (assignedLane === -1) {
      assignedLane = laneEndMonths.length
      laneEndMonths.push(eraEnd)
    } else {
      laneEndMonths[assignedLane] = eraEnd
    }

    return {
      era,
      lane: assignedLane,
    }
  })
}

function App() {
  const [birthYear, setBirthYear] =
    useState('')

  const [userProfile, setUserProfile] =
    useState<UserProfile | null>(null)

  const [eras, setEras] =
    useState<Era[]>([])

  const [selectedEraId, setSelectedEraId] =
    useState<string | null>(null)
  
  const [editingEraId, setEditingEraId] =
    useState<string | null>(null)

  const [
    isEraModalOpen,
    setIsEraModalOpen,
  ] = useState(false)

  const [
    newEraName,
    setNewEraName,
  ] = useState('')

  const [
    newEraStartMonth,
    setNewEraStartMonth,
  ] = useState('')

  const [
    newEraEndMonth,
    setNewEraEndMonth,
  ] = useState('')

  const [
    newEraDescription,
    setNewEraDescription,
  ] = useState('')

  // 현재 날짜
  const now = new Date()

  const currentYear =
    now.getFullYear()

  const currentMonth =
    now.getMonth() + 1

  // 예: 2026-09
  const currentMonthValue =
    `${currentYear}-${String(currentMonth).padStart(2, '0')}`

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    const year =
      Number(birthYear)

    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > currentYear
    ) {
      alert(
        `출생연도는 1900년부터 ${currentYear}년 사이로 입력해주세요.`,
      )

      return
    }

    const profile: UserProfile = {
      id: 'user-1',
      birthYear: year,
    }

    const schoolEras =
      createSchoolEras(
        year,
        currentMonthValue,
      )

    setUserProfile(profile)

    setEras(schoolEras)
  }

  // -------------------------
  // 온보딩 화면
  // -------------------------

  if (userProfile === null) {
    return (
      <main className="onboarding">
        <h1>
          Music Archive
        </h1>

        <p>
          당신의 음악 타임라인을
          만들어보세요.
        </p>

        <form
          onSubmit={handleSubmit}
        >
          <label htmlFor="birthYear">
            출생연도
          </label>

          <input
            id="birthYear"
            type="number"
            min={1900}
            max={currentYear}
            step={1}
            required
            placeholder="예: 2004"
            value={birthYear}
            onChange={(event) =>
              setBirthYear(
                event.target.value,
              )
            }
          />

          <button
            type="submit"
            disabled={
              birthYear === ''
            }
          >
            시작하기
          </button>
        </form>
      </main>
    )
  }

  // -------------------------
  // Life Timeline
  // -------------------------

  const birthMonthValue =
    `${userProfile.birthYear}-01`

  const timelineStart =
    userProfile.birthYear * 12

  const timelineEnd =
    currentYear * 12 +
    (currentMonth - 1)

  const totalMonths =
    timelineEnd -
    timelineStart +
    1

  const monthWidth = 8

  const timelineCanvasWidth =
    totalMonths * monthWidth
  
  const years =
    Array.from(
      {
        length:
          currentYear -
          userProfile.birthYear +
          1,
      },

      (_, index) =>
        userProfile.birthYear +
        index,
    )

  const erasWithLanes = 
    assignEraLanes(eras)

  const selectedEra =
    eras.find(
      (era) =>
        era.id === selectedEraId,
    ) ?? null

  const laneCount =
    erasWithLanes.length === 0
      ? 1
      : Math.max(
          ...erasWithLanes.map(
            ({ lane }) => lane,
          ),
        ) + 1

  const laneHeight = 72

  const eraCanvasHeight =
    Math.max(
      250,
      laneCount * laneHeight + 40,
    )

  function handleSaveEra(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (
      newEraName === '' ||
      newEraStartMonth === '' ||
      newEraEndMonth === ''
    ) {
      return
    }

    if (
      newEraStartMonth <
        birthMonthValue ||
      newEraEndMonth >
        currentMonthValue
    ) {
      alert(
        `시절은 ${birthMonthValue}부터 ${currentMonthValue}까지만 설정할 수 있습니다.`,
      )

      return
    }

    if (
      newEraStartMonth >
      newEraEndMonth
    ) {
      alert(
        '종료 시기는 시작 시기보다 빠를 수 없습니다.',
      )

      return
    }

    if (editingEraId !== null) {
      setEras((previousEras) =>
        previousEras.map((era) => {
          if (era.id !== editingEraId) {
            return era
          }

          return {
            ...era,
            name: newEraName,
            startMonth: newEraStartMonth,
            endMonth: newEraEndMonth,
            description: newEraDescription,
          }
        }),
      )
    } else {
      const newEra: Era = {
        id: crypto.randomUUID(),
        name: newEraName,
        startMonth: newEraStartMonth,
        endMonth: newEraEndMonth,
        description: newEraDescription,
        origin: 'CUSTOM',
      }

      setEras((previousEras) => [
        ...previousEras,
        newEra,
      ])
    }

    closeEraModal()
  }

  function openCreateEraModal() {
    setEditingEraId(null)

    setNewEraName('')
    setNewEraStartMonth('')
    setNewEraEndMonth('')
    setNewEraDescription('')

    setIsEraModalOpen(true)
  }

  function openEditEraModal(era: Era) {
    setEditingEraId(era.id)

    setNewEraName(era.name)
    setNewEraStartMonth(era.startMonth)
    setNewEraEndMonth(era.endMonth)
    setNewEraDescription(
      era.description ?? '',
    )

    setIsEraModalOpen(true)
  }

  function closeEraModal() {
    setEditingEraId(null)

    setNewEraName('')
    setNewEraStartMonth('')
    setNewEraEndMonth('')
    setNewEraDescription('')

    setIsEraModalOpen(false)
  }

  return (
    <main className="archive">
      <header className="archive-header">
        <div>
          <h1>
            My Music Timeline
          </h1>

          <p>
            출생연도:{' '}
            {userProfile.birthYear}
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateEraModal}
        >
          + 새로운 시절 만들기
        </button>
      </header>

      <section className="timeline-wrapper">
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
                      onClick={() =>
                        setSelectedEraId(era.id)
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

      {selectedEra && (
        <section className="era-detail">
          <h2>{selectedEra.name}</h2>

          <p>
            {selectedEra.startMonth}
            {' ~ '}
            {selectedEra.endMonth}
          </p>

          {selectedEra.description && (
            <p>
              {selectedEra.description}
            </p>
          )}

          <div className="era-detail-actions">
            <button
              type="button"
              onClick={() =>
                openEditEraModal(selectedEra)
              }
            >
              수정
            </button>
          </div>
        </section>
      )}

      {/* Era 생성 모달 */}

      {isEraModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>
              {editingEraId === null
                ? '새로운 시절 만들기'
                : '시절 수정하기'}
            </h2>

            <form
              onSubmit={
                handleSaveEra
              }
            >
              <label htmlFor="eraName">
                시절 이름
              </label>

              <input
                id="eraName"
                type="text"
                required
                placeholder="예: 고3"
                value={
                  newEraName
                }
                onChange={(
                  event,
                ) =>
                  setNewEraName(
                    event.target
                      .value,
                  )
                }
              />

              <label htmlFor="eraStart">
                시작
              </label>

              <input
                id="eraStart"
                type="month"
                min={
                  birthMonthValue
                }
                max={
                  currentMonthValue
                }
                required
                value={
                  newEraStartMonth
                }
                onChange={(
                  event,
                ) =>
                  setNewEraStartMonth(
                    event.target
                      .value,
                  )
                }
              />

              <label htmlFor="eraEnd">
                종료
              </label>

              <input
                id="eraEnd"
                type="month"
                min={
                  birthMonthValue
                }
                max={
                  currentMonthValue
                }
                required
                value={
                  newEraEndMonth
                }
                onChange={(
                  event,
                ) =>
                  setNewEraEndMonth(
                    event.target
                      .value,
                  )
                }
              />

              <label htmlFor="eraDescription">
                설명
              </label>

              <textarea
                id="eraDescription"
                placeholder="이 시절에 대한 간단한 설명"
                value={
                  newEraDescription
                }
                onChange={(
                  event,
                ) =>
                  setNewEraDescription(
                    event.target
                      .value,
                  )
                }
              />

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={
                    closeEraModal
                  }
                >
                  취소
                </button>

                <button type="submit">
                  {editingEraId === null
                    ? '만들기'
                    : '수정 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

export default App