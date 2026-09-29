import { useState } from 'react'
import type { Track } from '../types/track'
import type { MusicSearchResult } from '../types/musicSearch'
import { searchMusic } from '../services/musicSearch'

type EraTracksProps = {
  tracks: Track[]
  onAdd: (title: string, artist: string) => void
  onRemove: (trackId: string) => void
}

function EraTracks({ tracks, onAdd, onRemove }: EraTracksProps) {
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const canAdd = title.trim() !== '' && artist.trim() !== ''
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MusicSearchResult[]>([])
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function handleSearch() {
    if (!query.trim() || searchStatus === 'loading') return
    setSearchStatus('loading')
    setResults([])
    try {
      setResults(await searchMusic(query))
      setSearchStatus('success')
    } catch {
      setSearchStatus('error')
    }
  }

  return (
    <section className="era-tracks" aria-label="이 시절의 곡">
      <h3>이 시절의 곡</h3>
      <section className="music-search" aria-label="곡 검색">
        <form className="track-form" onSubmit={(event) => {
          event.preventDefault()
          void handleSearch()
        }}>
          <label>
            곡 검색어
            <input placeholder="곡 제목 또는 아티스트" value={query}
              onChange={(event) => setQuery(event.target.value)} disabled={searchStatus === 'loading'} />
          </label>
          <button type="submit" disabled={!query.trim() || searchStatus === 'loading'}>검색</button>
        </form>
        <p role="status">
          {searchStatus === 'idle' && '검색하거나 아래에서 곡을 직접 입력할 수 있습니다.'}
          {searchStatus === 'loading' && '검색 중...'}
          {searchStatus === 'success' && (results.length === 0 ? '검색 결과가 없습니다.' : `검색 결과 ${results.length}곡`)}
          {searchStatus === 'error' && '곡을 검색하지 못했습니다. 잠시 후 다시 검색해주세요.'}
        </p>
        {results.length > 0 && (
          <ul className="track-list" aria-label="검색 결과">
            {results.map((result) => (
              <li key={result.externalId}>
                <span className="track-info"><strong>{result.title}</strong><span className="track-artist">{result.artist}</span></span>
                <button type="button" aria-label={`${result.title} 추가`}
                  onClick={() => onAdd(result.title, result.artist)}>추가</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <h4>직접 입력</h4>
      <form className="track-form" onSubmit={(event) => {
        event.preventDefault()
        if (!canAdd) return
        onAdd(title.trim(), artist.trim())
        setTitle('')
        setArtist('')
      }}>
        <label>
          곡 제목
          <input placeholder="기억나는 곡 제목" value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          아티스트
          <input placeholder="가수 또는 그룹 이름" value={artist} onChange={(event) => setArtist(event.target.value)} required />
        </label>
        <button type="submit" disabled={!canAdd}>곡 추가</button>
      </form>
      <h4>현재 Era에 저장된 곡</h4>
      {tracks.length === 0 ? (
        <p className="track-empty">아직 추가한 곡이 없습니다. 위에 곡 제목과 아티스트를 입력해 첫 곡을 남겨보세요.</p>
      ) : (
        <ul className="track-list" aria-label="저장된 곡">
          {tracks.map((track) => (
            <li key={track.id}>
              <span className="track-info"><strong>{track.title}</strong><span className="track-artist">{track.artist}</span></span>
              <button className="track-delete" type="button" aria-label={`${track.title} 삭제`} onClick={() => onRemove(track.id)}>곡 삭제</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default EraTracks
