import type { Era } from '../types/era'
import type { Track, EraTrack } from '../types/track'
import { isImageUrl, isReleaseDate } from './track'

export type UserProfile = { id: string; birthYear: number }

type ArchiveData = {
  userProfile: UserProfile | null
  eras: Era[]
  music: { tracks: Track[]; eraTracks: EraTrack[] }
}

const STORAGE_KEY = 'music-archive-data'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

function isEra(value: unknown): value is Era {
  return isObject(value) && isText(value.id) && typeof value.name === 'string'
    && isMonth(value.startMonth) && isMonth(value.endMonth)
    && value.startMonth <= value.endMonth
    && (value.origin === 'AUTO_SCHOOL' || value.origin === 'CUSTOM')
    && (value.description === undefined || typeof value.description === 'string')
    && (value.schoolStage === undefined || value.schoolStage === 'ELEMENTARY'
      || value.schoolStage === 'MIDDLE' || value.schoolStage === 'HIGH')
}

function isTrack(value: unknown): value is Track {
  return isObject(value) && isText(value.id) && isText(value.title) && isText(value.artist)
}

export function loadArchive(): ArchiveData {
  const empty: ArchiveData = { userProfile: null, eras: [], music: { tracks: [], eraTracks: [] } }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return empty
    const data: unknown = JSON.parse(raw)
    if (!isObject(data)) return empty
    const profile = data.userProfile
    if (!isObject(profile) || !isText(profile.id)
      || typeof profile.birthYear !== 'number' || !Number.isInteger(profile.birthYear)
      || profile.birthYear < 1900 || profile.birthYear > new Date().getFullYear()) return empty

    // JSON은 타입이 보장되지 않으므로 유효한 항목만 복원한다.
    const eras = Array.isArray(data.eras) ? data.eras.filter(isEra) : []
    const music = isObject(data.music) ? data.music : {}
    const tracks = Array.isArray(music.tracks) ? music.tracks.filter(isTrack).map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      ...(isImageUrl(track.albumImageUrl) ? { albumImageUrl: track.albumImageUrl } : {}),
      ...(isReleaseDate(track.releaseDate) ? { releaseDate: track.releaseDate } : {}),
    })) : []
    const eraTracks = Array.isArray(music.eraTracks)
      ? music.eraTracks.filter((value: unknown): value is EraTrack =>
        isObject(value) && typeof value.eraId === 'string' && typeof value.trackId === 'string'
        && eras.some((era) => era.id === value.eraId)
        && tracks.some((track) => track.id === value.trackId))
      : []
    return { userProfile: { id: profile.id, birthYear: profile.birthYear }, eras, music: { tracks, eraTracks } }
  } catch {
    // JSON 손상이나 브라우저 저장 제한이 있어도 앱을 시작한다.
    return empty
  }
}

export function saveArchive(data: ArchiveData): void {
  // 초기 상태나 복원 실패 시 저장된 데이터를 빈 값으로 덮어쓰지 않는다.
  if (data.userProfile === null) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    console.warn('Music Archive: 데이터를 저장하지 못했습니다.')
  }
}
