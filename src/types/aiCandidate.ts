import type { TrackInput } from './track'

// 형식이 확인된 AI 제안일 뿐, 존재/정체성/발매 시기가 검증된 후보가 아니다.
export type AiSongSuggestion = Pick<TrackInput, 'title' | 'artist'>

export type AiSuggestionParseResult =
  | { status: 'valid'; suggestions: AiSongSuggestion[]; rejectedItemCount: number; duplicateCount: number }
  | { status: 'invalid_json' | 'invalid_shape' | 'limit_exceeded' }
