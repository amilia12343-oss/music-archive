import { useState } from 'react'
import type { Track, TrackInput } from '../types/track'
import MusicSearch from './MusicSearch'
import TrackSummary from './TrackSummary'
import { sameSong } from '../utils/track'

type EraTracksProps = {
  endMonth: string
  tracks: Track[]
  onAdd: (input: TrackInput) => void
  onRemove: (trackId: string) => void
}

function EraTracks({ endMonth, tracks, onAdd, onRemove }: EraTracksProps) {
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [duplicateAttempt, setDuplicateAttempt] = useState(false)
  const isAdded = (song: TrackInput) => tracks.some((track) => sameSong(track, song))
  const canAdd = title.trim() !== '' && artist.trim() !== ''
  return (
    <section className="era-tracks" aria-label="이 시절의 곡">
      <h3>이 시절의 곡</h3>
      <MusicSearch onChoose={onAdd} isAdded={isAdded} endMonth={endMonth}>
      <h4>직접 입력</h4>
      <form className="track-form" onSubmit={(event) => {
        event.preventDefault()
        if (!canAdd) return
        if (isAdded({ title, artist })) {
          setDuplicateAttempt(true)
          return
        }
        setDuplicateAttempt(false)
        onAdd({ title: title.trim(), artist: artist.trim() })
        setTitle('')
        setArtist('')
      }}>
        <label>
          곡 제목
          <input placeholder="기억나는 곡 제목" value={title} onChange={(event) => { setTitle(event.target.value); setDuplicateAttempt(false) }} required />
        </label>
        <label>
          아티스트
          <input placeholder="가수 또는 그룹 이름" value={artist} onChange={(event) => { setArtist(event.target.value); setDuplicateAttempt(false) }} required />
        </label>
        <button type="submit" disabled={!canAdd}>곡 추가</button>
      </form>
      <p role="status"><small>{duplicateAttempt && isAdded({ title, artist }) ? '이미 이 시절에 추가된 곡입니다.' : ''}</small></p>
      </MusicSearch>
      <h4>현재 Era에 저장된 곡</h4>
      {tracks.length === 0 ? (
        <p className="track-empty">아직 추가한 곡이 없습니다. 검색으로 첫 곡을 찾아보세요. 원하는 곡이 없으면 검색 후 직접 추가할 수 있습니다.</p>
      ) : (
        <ul className="track-list" aria-label="저장된 곡">
          {tracks.map((track) => (
            <li key={track.id}>
              <TrackSummary track={track} />
              <button className="track-delete" type="button" aria-label={`${track.title} 삭제`} onClick={() => onRemove(track.id)}>곡 삭제</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default EraTracks
