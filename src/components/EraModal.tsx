import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Era, EraFormValues } from '../types/era'

type EraModalProps = {
  era: Era | null
  minMonth: string
  maxMonth: string
  onSave: (values: EraFormValues) => void
  onClose: () => void
}

function EraModal({ era, minMonth, maxMonth, onSave, onClose }: EraModalProps) {
  // 모달이 열릴 때 마운트되고, 닫히면 임시 입력 상태도 사라진다.
  const [name, setName] = useState(era?.name ?? '')
  const [startMonth, setStartMonth] = useState(era?.startMonth ?? '')
  const [endMonth, setEndMonth] = useState(era?.endMonth ?? '')
  const [description, setDescription] = useState(era?.description ?? '')

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (
      name === '' ||
      startMonth === '' ||
      endMonth === ''
    ) {
      return
    }

    if (
      startMonth <
        minMonth ||
      endMonth >
        maxMonth
    ) {
      alert(
        `시절은 ${minMonth}부터 ${maxMonth}까지만 설정할 수 있습니다.`,
      )

      return
    }

    if (
      startMonth >
      endMonth
    ) {
      alert(
        '종료 시기는 시작 시기보다 빠를 수 없습니다.',
      )

      return
    }

    onSave({ name, startMonth, endMonth, description })
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>
          {era === null
            ? '새로운 시절 만들기'
            : '시절 수정하기'}
        </h2>

        <form
          onSubmit={
            handleSubmit
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
              name
            }
            onChange={(
              event,
            ) =>
              setName(
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
              minMonth
            }
            max={
              maxMonth
            }
            required
            value={
              startMonth
            }
            onChange={(
              event,
            ) =>
              setStartMonth(
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
              minMonth
            }
            max={
              maxMonth
            }
            required
            value={
              endMonth
            }
            onChange={(
              event,
            ) =>
              setEndMonth(
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
              description
            }
            onChange={(
              event,
            ) =>
              setDescription(
                event.target
                  .value,
              )
            }
          />

          <div className="modal-actions">
            <button
              type="button"
              onClick={
                onClose
              }
            >
              취소
            </button>

            <button type="submit">
              {era === null
                ? '만들기'
                : '수정 완료'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EraModal
