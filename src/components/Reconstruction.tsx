import { useState } from 'react'
import type { Era } from '../types/era'
import type { CandidateResponse, ReconstructionCandidate, ReconstructionRoundResult, ReconstructionStatus } from '../types/reconstruction'
import TrackSummary from './TrackSummary'
import '../styles/reconstruction.css'

type ReconstructionProps = {
  era: Era
  roundNumber: number
  candidates: ReconstructionCandidate[]
  onBack: () => void
  onCompleteRound: (result: ReconstructionRoundResult) => void
}

const actions: { status: ReconstructionStatus; label: string }[] = [
  { status: 'LISTENED', label: '들었어요' },
  { status: 'UNASSIGNED', label: '시절이 애매해요' },
  { status: 'NOT_LISTENED', label: '안 들었어요' },
]

export default function Reconstruction({ era, roundNumber, candidates, onBack, onCompleteRound }: ReconstructionProps) {
  const [responses, setResponses] = useState<CandidateResponse[]>([])
  const currentResponses = responses.filter((response) => candidates.some((candidate) => candidate.id === response.candidateId))

  function toggleResponse(candidateId: string, status: ReconstructionStatus) {
    setResponses((previous) => {
      const existing = previous.find((response) => response.candidateId === candidateId)
      const remaining = previous.filter((response) => response.candidateId !== candidateId)
      // 같은 응답을 다시 누르면 레코드를 제거해 미평가로 돌아간다.
      return existing?.status === status ? remaining : [...remaining, { candidateId, status }]
    })
  }

  return (
    <main className="reconstruction">
      <button type="button" onClick={onBack}>시절 상세로 돌아가기</button>
      <header>
        <p>{era.name} · {era.startMonth} ~ {era.endMonth}</p>
        <h1>이 시절의 기억을 찾아볼까요?</h1>
        <p>먼저 그 시절의 음악부터 떠올려볼게요.</p>
        <h2>Round {roundNumber}</h2>
      </header>
      {candidates.length === 0 ? (
        <p className="reconstruction-empty" role="status">아직 보여드릴 곡이 없어요.</p>
      ) : (
        <>
          <p>들었어요: 이 시절의 청취 기억 · 시절이 애매해요: 곡은 기억나지만 시절은 불확실 · 안 들었어요: 이 시절에는 듣지 않음</p>
          <p>선택하지 않은 곡은 미평가입니다. 같은 버튼을 다시 누르면 선택을 취소할 수 있어요.</p>
          <p role="status">{candidates.length}곡 중 {currentResponses.length}곡 응답</p>
          <ul className="track-list" aria-label="기억 확인 후보">
            {candidates.map((candidate) => {
              const status = currentResponses.find((response) => response.candidateId === candidate.id)?.status
              return (
                <li key={candidate.id}>
                  <TrackSummary track={candidate.track} />
                  <div className="reconstruction-actions" role="group" aria-label={`${candidate.track.title} 기억 확인`}>
                    <span>{actions.find((action) => action.status === status)?.label ?? '미평가'}</span>
                    {actions.map((action) => (
                      <button key={action.status} type="button" aria-pressed={status === action.status}
                        onClick={() => toggleResponse(candidate.id, action.status)}>{action.label}</button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
          <p>이번 선택은 아직 음악 기록에 저장되지 않습니다.</p>
          <button type="button" onClick={() => onCompleteRound({ roundNumber, candidateIds: candidates.map((candidate) => candidate.id), responses: currentResponses })}>이번 기억 확인 마치기</button>
        </>
      )}
    </main>
  )
}
