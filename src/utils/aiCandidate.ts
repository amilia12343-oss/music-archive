import type { AiSongSuggestion, AiSuggestionParseResult } from '../types/aiCandidate'

// D2의 형식 검사 한도다. API token/비용 한도나 metadata 검증을 대신하지 않는다.
const MAX_JSON_LENGTH = 16000
const MAX_SUGGESTIONS = 30
const MAX_FIELD_LENGTH = 200
const keyPart = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAiSuggestions(json: string): AiSuggestionParseResult {
  if (json.length > MAX_JSON_LENGTH) return { status: 'limit_exceeded' }
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return { status: 'invalid_json' } }
  if (!isRecord(raw) || Object.keys(raw).length !== 1 || !Array.isArray(raw.songs)) {
    return { status: 'invalid_shape' }
  }
  if (raw.songs.length > MAX_SUGGESTIONS) return { status: 'limit_exceeded' }

  const suggestions: AiSongSuggestion[] = []
  const seen = new Set<string>()
  let rejectedItemCount = 0
  let duplicateCount = 0
  for (const item of raw.songs) {
    if (!isRecord(item) || Object.keys(item).length !== 2
      || typeof item.title !== 'string' || typeof item.artist !== 'string'
      || !item.title.trim() || !item.artist.trim()
      || item.title.length > MAX_FIELD_LENGTH || item.artist.length > MAX_FIELD_LENGTH) {
      rejectedItemCount++
      continue
    }
    const song = { title: item.title.trim(), artist: item.artist.trim() }
    // 배열 JSON 키로 title/artist 안의 구분 문자에 의한 충돌을 피한다.
    const key = JSON.stringify([keyPart(song.title), keyPart(song.artist)])
    if (seen.has(key)) { duplicateCount++; continue }
    seen.add(key)
    suggestions.push(song)
  }
  return { status: 'valid', suggestions, rejectedItemCount, duplicateCount }
}
