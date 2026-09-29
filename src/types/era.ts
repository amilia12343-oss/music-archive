export type Era = {
  id: string
  name: string
  startMonth: string
  endMonth: string
  description?: string
  origin: 'AUTO_SCHOOL' | 'CUSTOM'
  schoolStage?: 'ELEMENTARY' | 'MIDDLE' | 'HIGH'
}

// 생성·수정 폼에서 사용자에게 입력받는 값만 전달한다.
export type EraFormValues = {
  name: string
  startMonth: string
  endMonth: string
  description: string
}
