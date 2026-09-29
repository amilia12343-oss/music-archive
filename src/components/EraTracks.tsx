import { useState } from 'react'
import type { Track } from '../types/track'

type EraTracksProps = {
  tracks: Track[]
  onAdd: (title: string, artist: string) => void
  onRemove: (trackId: string) => void
}

function EraTracks({ tracks, onAdd, onRemove }: EraTracksProps) {
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const canAdd = title.trim() !== '' && artist.trim() !== ''

  return (
    <section className="era-tracks" aria-label="이 시절의 곡">
      <h3>이 시절의 곡</h3>
      <form className="track-form" onSubmit={(event) => {
        event.preventDefault()
        if (!canAdd) return
        onAdd(title.trim(), artist.trim())
        setTitle('')
        setArtist('')
      }}>
        <label>
          곡 제목
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          아티스트
          <input value={artist} onChange={(event) => setArtist(event.target.value)} required />
        </label>
        <button type="submit" disabled={!canAdd}>곡 추가</button>
      </form>
      {tracks.length === 0 ? (
        <p>아직 추가한 곡이 없습니다.</p>
      ) : (
        <ul className="track-list">
          {tracks.map((track) => (
            <li key={track.id}>
              <span><strong>{track.title}</strong> — {track.artist}</span>
              <button type="button" aria-label={`${track.title} 삭제`} onClick={() => onRemove(track.id)}>삭제</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default EraTracks
