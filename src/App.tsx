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

function App() {
  const [birthYear, setBirthYear] =
    useState('')

  const [userProfile, setUserProfile] =
    useState<UserProfile | null>(null)

  const [eras, setEras] =
    useState<Era[]>([])

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

  function handleCreateEra(
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

    const newEra: Era = {
      id: crypto.randomUUID(),
      name: newEraName,
      startMonth:
        newEraStartMonth,
      endMonth:
        newEraEndMonth,
      description:
        newEraDescription,
      origin: 'CUSTOM',
    }

    setEras(
      (previousEras) => [
        ...previousEras,
        newEra,
      ],
    )

    setNewEraName('')
    setNewEraStartMonth('')
    setNewEraEndMonth('')
    setNewEraDescription('')

    setIsEraModalOpen(false)
  }

  function closeEraModal() {
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
          onClick={() =>
            setIsEraModalOpen(true)
          }
        >
          + 새로운 시절 만들기
        </button>
      </header>

      <section className="timeline-wrapper">
        <div className="timeline">
          {/* 연도 */}

          <div className="year-row">
            {years.map(
              (year) => {
                const yearPosition =
                  ((year * 12 -
                    timelineStart) /
                    totalMonths) *
                  100

                return (
                  <div
                    className="year"
                    key={year}
                    style={{
                      left: `${yearPosition}%`,
                    }}
                  >
                    {year}
                  </div>
                )
              },
            )}
          </div>

          {/* Era */}

          <div className="era-area">
            {eras.map(
              (era) => {
                const eraStart =
                  monthToIndex(
                    era.startMonth,
                  )

                const eraEnd =
                  monthToIndex(
                    era.endMonth,
                  )

                const left =
                  ((eraStart -
                    timelineStart) /
                    totalMonths) *
                  100

                const width =
                  ((eraEnd -
                    eraStart +
                    1) /
                    totalMonths) *
                  100

                return (
                  <button
                    type="button"
                    className="era-bar"
                    key={era.id}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                    }}
                  >
                    <strong>
                      {era.name}
                    </strong>

                    <span>
                      {
                        era.startMonth
                      }
                      {' ~ '}
                      {
                        era.endMonth
                      }
                    </span>
                  </button>
                )
              },
            )}
          </div>
        </div>
      </section>

      {/* Era 생성 모달 */}

      {isEraModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>
              새로운 시절 만들기
            </h2>

            <form
              onSubmit={
                handleCreateEra
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
                  저장
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