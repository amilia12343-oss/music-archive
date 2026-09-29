import { useState } from 'react'
import type { ReactNode } from 'react'
import type { MusicSearchResult } from '../types/musicSearch'
import { searchMusic } from '../services/musicSearch'
import TrackSummary from './TrackSummary'
import { isTrackAvailableForEra } from '../utils/track'

type MusicSearchProps = {
  onChoose: (result: MusicSearchResult) => void
  isSelected?: (result: MusicSearchResult) => boolean
  isAdded?: (result: MusicSearchResult) => boolean
  endMonth: string
  children: ReactNode
}

export default function MusicSearch({ onChoose, isSelected, isAdded, endMonth, children }: MusicSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MusicSearchResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [hasSearched, setHasSearched] = useState(false)
  const visibleResults = results.filter((result) => isTrackAvailableForEra(result, endMonth)).slice(0, 10)
  if (isAdded && !isSelected) {
    // 표시 대상은 유지하고, 각 그룹 안에서는 API 순서를 보존한다.
    visibleResults.sort((a, b) => Number(isAdded(a)) - Number(isAdded(b)))
  }

  async function handleSearch() {
    if (!query.trim() || status === 'loading') return
    setStatus('loading')
    setResults([])
    try {
      setResults(await searchMusic(query))
      setStatus('success')
    } catch {
      setStatus('error')
    } finally {
      setHasSearched(true)
    }
  }

  return (
    <section className="music-search" aria-label="곡 검색">
      <p>이 시절까지 발매된 곡을 기준으로 검색합니다.</p>
      <form className="track-form" onSubmit={(event) => {
        event.preventDefault()
        void handleSearch()
      }}>
        <label>곡 검색어
          <input placeholder="곡 제목 또는 아티스트" value={query}
            onChange={(event) => setQuery(event.target.value)} disabled={status === 'loading'} />
        </label>
        <button type="submit" disabled={!query.trim() || status === 'loading'}>검색</button>
      </form>
      <p role="status">
        {status === 'idle' && '곡 제목 또는 아티스트로 검색해주세요.'}
        {status === 'loading' && '검색 중...'}
        {status === 'success' && (visibleResults.length === 0 ? '검색 결과가 없습니다.' : `검색 결과 ${visibleResults.length}곡`)}
        {status === 'error' && '곡을 검색하지 못했습니다. 잠시 후 다시 검색해주세요.'}
      </p>
      {visibleResults.length > 0 && <ul className="track-list" aria-label="검색 결과">
        {visibleResults.map((result) => (
          <li key={result.externalId}>
            <TrackSummary track={result} />
            <button type="button" aria-pressed={isSelected ? isSelected(result) : undefined}
              disabled={!isSelected && isAdded?.(result)}
              aria-label={`${result.title} ${isSelected ? '선택' : isAdded?.(result) ? '추가됨' : '추가'}`} onClick={() => onChoose(result)}>
              {isSelected ? (isSelected(result) ? '선택됨' : '선택') : isAdded?.(result) ? '추가됨' : '추가'}
            </button>
          </li>
        ))}
      </ul>}
      {hasSearched && <details className="manual-fallback">
        <summary>원하는 곡을 찾지 못했나요? 직접 추가하기</summary>
        {children}
      </details>}
    </section>
  )
}
