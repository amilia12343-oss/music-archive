import type { Era } from '../types/era'
import { monthToIndex } from './date'

export function createSchoolEras(
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

type EraWithLane = {
  era: Era
  lane: number
}

export function assignEraLanes(eras: Era[]): EraWithLane[] {
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
