import { useState } from 'react'
import Onboarding from './components/Onboarding'
import Timeline from './components/Timeline'
import EraDetail from './components/EraDetail'
import EraModal from './components/EraModal'
import type { Era, EraFormValues } from './types/era'
import type { Track, EraTrack } from './types/track'
import { formatMonth } from './utils/date'
import { createSchoolEras } from './utils/era'

import './styles/onboarding.css'
import './styles/timeline.css'
import './styles/modal.css'

type UserProfile = {
  id: string
  birthYear: number
}

function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [eras, setEras] = useState<Era[]>([])
  const [music, setMusic] = useState<{ tracks: Track[]; eraTracks: EraTrack[] }>({
    tracks: [],
    eraTracks: [],
  })
  const [selectedEraId, setSelectedEraId] = useState<string | null>(null)
  const [editingEraId, setEditingEraId] = useState<string | null>(null)
  const [isEraModalOpen, setIsEraModalOpen] = useState(false)

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonthValue = formatMonth(now)

  function handleCompleteOnboarding(birthYear: number) {
    setUserProfile({ id: 'user-1', birthYear })
    setEras(createSchoolEras(birthYear, currentMonthValue))
  }

  function handleSaveEra(values: EraFormValues) {
    if (editingEraId !== null) {
      setEras((previousEras) =>
        previousEras.map((era) =>
          era.id === editingEraId ? { ...era, ...values } : era,
        ),
      )
    } else {
      const newEra: Era = {
        id: crypto.randomUUID(),
        ...values,
        origin: 'CUSTOM',
      }
      setEras((previousEras) => [...previousEras, newEra])
    }

    closeEraModal()
  }

  function openCreateEraModal() {
    setEditingEraId(null)
    setIsEraModalOpen(true)
  }

  function handleAddTrack(title: string, artist: string) {
    if (selectedEraId === null || !title.trim() || !artist.trim()) return
    const track: Track = { id: crypto.randomUUID(), title: title.trim(), artist: artist.trim() }
    setMusic((previous) => ({
      tracks: [...previous.tracks, track],
      eraTracks: [...previous.eraTracks, { eraId: selectedEraId, trackId: track.id }],
    }))
  }

  function handleRemoveTrack(trackId: string) {
    setMusic((previous) => {
      const eraTracks = previous.eraTracks.filter(
        (relation) => !(relation.eraId === selectedEraId && relation.trackId === trackId),
      )
      return {
        eraTracks,
        // 다른 Era에서도 사용하는 곡은 유지한다.
        tracks: previous.tracks.filter(
          (track) => track.id !== trackId || eraTracks.some((relation) => relation.trackId === trackId),
        ),
      }
    })
  }

  function openEditEraModal(era: Era) {
    setEditingEraId(era.id)
    setIsEraModalOpen(true)
  }

  function closeEraModal() {
    setEditingEraId(null)
    setIsEraModalOpen(false)
  }

  if (userProfile === null) {
    return (
      <Onboarding
        currentYear={currentYear}
        onComplete={handleCompleteOnboarding}
      />
    )
  }

  const birthMonthValue = `${userProfile.birthYear}-01`
  const selectedEra = eras.find((era) => era.id === selectedEraId) ?? null
  const editingEra = eras.find((era) => era.id === editingEraId) ?? null
  const selectedTracks = music.tracks.filter((track) =>
    music.eraTracks.some((relation) => relation.eraId === selectedEraId && relation.trackId === track.id),
  ).sort((a, b) => a.artist.localeCompare(b.artist, 'ko'))

  return (
    <main className="archive">
      <header className="archive-header">
        <div>
          <h1>
            My Music Timeline
          </h1>

          <p>
            출생연도:{' '}
            {userProfile.birthYear}
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateEraModal}
        >
          + 새로운 시절 만들기
        </button>
      </header>

      <Timeline
        birthYear={userProfile.birthYear}
        currentMonthValue={currentMonthValue}
        eras={eras}
        selectedEraId={selectedEraId}
        onSelectEra={setSelectedEraId}
      />

      {selectedEra && (
        <EraDetail era={selectedEra} onEdit={openEditEraModal}
          tracks={selectedTracks} onAddTrack={handleAddTrack} onRemoveTrack={handleRemoveTrack} />
      )}

      {isEraModalOpen && (
        <EraModal
          era={editingEra}
          minMonth={birthMonthValue}
          maxMonth={currentMonthValue}
          onSave={handleSaveEra}
          onClose={closeEraModal}
        />
      )}
    </main>
  )
}

export default App
