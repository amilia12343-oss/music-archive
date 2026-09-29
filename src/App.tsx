import { useEffect, useState } from 'react'
import Onboarding from './components/Onboarding'
import Timeline from './components/Timeline'
import EraDetail from './components/EraDetail'
import EraModal from './components/EraModal'
import SeedSelection from './components/SeedSelection'
import type { Era, EraFormValues } from './types/era'
import type { Track, EraTrack, TrackInput } from './types/track'
import { addTracksToEra } from './utils/track'
import { formatMonth } from './utils/date'
import { createSchoolEras } from './utils/era'
import { loadArchive, saveArchive } from './utils/storage'
import type { UserProfile } from './utils/storage'

import './styles/onboarding.css'
import './styles/timeline.css'
import './styles/modal.css'

function App() {
  const [initialData] = useState(loadArchive)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(initialData.userProfile)
  const [eras, setEras] = useState<Era[]>(initialData.eras)
  const [music, setMusic] = useState<{ tracks: Track[]; eraTracks: EraTrack[] }>(initialData.music)
  const [selectedEraId, setSelectedEraId] = useState<string | null>(null)
  const [editingEraId, setEditingEraId] = useState<string | null>(null)
  const [isEraModalOpen, setIsEraModalOpen] = useState(false)
  const [isSelectingSeeds, setIsSelectingSeeds] = useState(false)
  const [reconstructionSession, setReconstructionSession] = useState<{ eraId: string; trackIds: string[] } | null>(null)

  useEffect(() => {
    saveArchive({ userProfile, eras, music })
  }, [userProfile, eras, music])

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

  function handleAddTrack(input: TrackInput) {
    const era = eras.find((item) => item.id === selectedEraId)
    if (!era) return
    const result = addTracksToEra(era, [input], music)
    setMusic(result.music)
  }

  function handleCompleteSeeds(selected: TrackInput[]) {
    const era = eras.find((item) => item.id === selectedEraId)
    if (!era) return
    const result = addTracksToEra(era, selected, music)
    if (result.trackIds.length < 5) return
    setMusic(result.music)
    setReconstructionSession({ eraId: era.id, trackIds: result.trackIds })
    setIsSelectingSeeds(false)
  }

  function handleRemoveTrack(trackId: string) {
    setReconstructionSession((previous) => previous?.eraId === selectedEraId ? null : previous)
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

  if (isSelectingSeeds && selectedEra) {
    return <SeedSelection key={selectedEra.id} era={selectedEra} tracks={selectedTracks}
      onBack={() => setIsSelectingSeeds(false)} onComplete={handleCompleteSeeds} />
  }

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
          onStartReconstruction={() => setIsSelectingSeeds(true)}
          confirmedSeedCount={reconstructionSession?.eraId === selectedEra.id ? reconstructionSession.trackIds.length : 0}
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
