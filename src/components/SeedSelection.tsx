import { useState } from 'react'
import type { Era } from '../types/era'
import type { Track, TrackInput } from '../types/track'
import { sameSong, isTrackAvailableForEra } from '../utils/track'
import MusicSearch from './MusicSearch'
import TrackSummary from './TrackSummary'
import '../styles/seed-selection.css'

type SeedSelectionProps = {
  era: Era
  tracks: Track[]
  onBack: () => void
  onComplete: (selected: TrackInput[]) => void
}

export default function SeedSelection({ era, tracks, onBack, onComplete }: SeedSelectionProps) {
  const [selected, setSelected] = useState<TrackInput[]>([])
  const [personalSongs, setPersonalSongs] = useState<TrackInput[]>([])
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const isSelected = (song: TrackInput) => selected.some((item) => sameSong(item, song))
  const availableTracks = tracks.filter((song) => isTrackAvailableForEra(song, era.endMonth))

  function toggleSong(song: TrackInput) {
    setSelected((previous) => previous.some((item) => sameSong(item, song))
      ? previous.filter((item) => !sameSong(item, song))
      : [...previous, song])
  }

  function renderCandidate(song: TrackInput, key: string) {
    return <li key={key}>
      <TrackSummary track={song} />
      <button type="button" aria-pressed={isSelected(song)}
        aria-label={`${song.title} 선택`} onClick={() => toggleSong(song)}>
        {isSelected(song) ? '선택됨' : '선택'}
      </button>
    </li>
  }

  return (
    <main className="seed-selection">
      <button type="button" onClick={onBack}>뒤로 가기</button>
      <header>
        <p>현재 복원 중인 Era</p>
        <h1>{era.name}</h1>
        <p>{era.startMonth} ~ {era.endMonth}</p>
        <h2>이 시절 하면 바로 떠오르는 노래가 있나요?</h2>
        <p>기억나는 곡을 먼저 알려주세요. 2~3곡이면 충분해요.</p>
        <p>지금 떠오르는 곡이 없어도 괜찮아요. 더 기억난다면 원하는 만큼 골라주세요.</p>
      </header>

      <section aria-label="선택된 대표곡" className="seed-selected">
        <h2>선택된 대표곡 <span aria-live="polite">{selected.length}곡</span></h2>
        {selected.length === 0 ? <p>아직 선택한 대표곡이 없습니다.</p> : (
          <ul className="track-list">
            {selected.map((song, index) => <li key={index}>
              <TrackSummary track={song} />
              <button type="button" aria-label={`${song.title} 선택 해제`} onClick={() => toggleSong(song)}>선택 해제</button>
            </li>)}
          </ul>
        )}
      </section>

      <h2>{era.name} 시절의 대표곡 후보</h2>
      <p>이 시절에 실제로 들었다고 기억하는 곡만 선택해주세요. 후보가 청취 이력을 뜻하지는 않습니다.</p>
      <section aria-label="기존 Era 곡">
        <h3>현재 Era에 이미 저장된 곡</h3>
        <p>저장된 곡도 대표곡으로 직접 선택해야 합니다.</p>
        {availableTracks.length === 0 ? <p>선택 가능한 저장된 곡이 없습니다.</p> : (
          <ul className="track-list">{availableTracks.map((song) => renderCandidate(song, song.id))}</ul>
        )}
      </section>
      <h3>음악 검색</h3>
      <MusicSearch onChoose={toggleSong} isSelected={isSelected} endMonth={era.endMonth}>
      <section aria-label="나만의 곡">
        <h3>검색되지 않는 나만의 곡</h3>
        <form className="track-form" onSubmit={(event) => {
          event.preventDefault()
          if (!title.trim() || !artist.trim()) return
          const song = { title: title.trim(), artist: artist.trim() }
          setPersonalSongs((previous) => previous.some((item) => sameSong(item, song)) ? previous : [...previous, song])
          setTitle('')
          setArtist('')
        }}>
          <label>곡 제목<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
          <label>아티스트<input value={artist} onChange={(event) => setArtist(event.target.value)} required /></label>
          <button type="submit" disabled={!title.trim() || !artist.trim()}>후보 추가</button>
        </form>
        <ul className="track-list">{personalSongs.map((song, index) => renderCandidate(song, String(index)))}</ul>
      </section>
      </MusicSearch>
      <footer className="seed-completion">
        <p>완료하면 선택한 곡을 이 시절에 들었다고 확인하고 Archive에도 저장합니다. 뒤로 가면 미확정 선택은 버려집니다.</p>
        <button type="button" onClick={() => onComplete(selected)}>{selected.length === 0 ? '떠오르는 곡 없이 진행' : '이 시절에 들은 곡으로 확인'}</button>
        <p>완료하면 이 시절의 기억을 확인하는 화면으로 이어집니다.</p>
      </footer>
    </main>
  )
}
