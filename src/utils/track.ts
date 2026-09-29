import type { EraTrack, Track, TrackInput } from '../types/track'
import type { Era } from '../types/era'

export function isImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function isReleaseDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)
    || !Number.isFinite(Date.parse(value))) return false
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10)
}

export function isTrackAvailableForEra(track: TrackInput, endMonth: string): boolean {
  // 불명확한 발매일은 제외 근거가 아니다. 시차 변환 없이 원본의 월을 비교한다.
  return !isReleaseDate(track.releaseDate) || track.releaseDate.slice(0, 7) <= endMonth
}

export function sameSong(a: TrackInput, b: TrackInput): boolean {
  return a.title.trim().toLowerCase() === b.title.trim().toLowerCase()
    && a.artist.trim().toLowerCase() === b.artist.trim().toLowerCase()
}

// 외부 검색 ID 등은 복사하지 않고 실제 저장 필드만 만든다.
export function createTrack(input: TrackInput): Track {
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    artist: input.artist.trim(),
    ...(isImageUrl(input.albumImageUrl) ? { albumImageUrl: input.albumImageUrl } : {}),
    ...(isReleaseDate(input.releaseDate) ? { releaseDate: input.releaseDate } : {}),
  }
}

export function addTracksToEra(
  era: Pick<Era, 'id' | 'endMonth'>,
  candidates: TrackInput[],
  music: { tracks: Track[]; eraTracks: EraTrack[] },
) {
  const tracks = [...music.tracks]
  const eraTracks = [...music.eraTracks]
  const trackIds: string[] = []
  for (const candidate of candidates) {
    if (!candidate.title.trim() || !candidate.artist.trim()
      || !isTrackAvailableForEra(candidate, era.endMonth)) continue
    let track = tracks.find((item) => sameSong(item, candidate)
      && eraTracks.some((relation) => relation.eraId === era.id && relation.trackId === item.id))
    if (!track) {
      track = createTrack(candidate)
      tracks.push(track)
      eraTracks.push({ eraId: era.id, trackId: track.id })
    }
    if (!trackIds.includes(track.id)) trackIds.push(track.id)
  }
  return { music: { tracks, eraTracks }, trackIds }
}
