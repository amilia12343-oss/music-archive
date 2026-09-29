import { useState } from 'react'
import type { FormEvent } from 'react'

type OnboardingProps = {
  currentYear: number
  onComplete: (birthYear: number) => void
}

function Onboarding({ currentYear, onComplete }: OnboardingProps) {
  const [birthYear, setBirthYear] = useState('')

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

    onComplete(year)
  }

  return (
    <main className="onboarding">
      <h1>
        Music Archive
      </h1>

      <p>
        당신의 음악 타임라인을
        만들어보세요.
      </p>
      <p className="onboarding-hint">출생연도를 입력하면 학창 시절이 만들어집니다. 시절마다 기억나는 곡을 기록해보세요.</p>

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

export default Onboarding
