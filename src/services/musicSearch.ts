import type { MusicSearchResult } from '../types/musicSearch'
import { isImageUrl, isReleaseDate } from '../utils/track'

export async function searchMusic(query: string): Promise<MusicSearchResult[]> {
  const term = query.trim()
  if (!term) return []

  // Era 필터 적용 전에 충분한 후보를 한 번만 가져온다. 표시 개수는 UI에서 제한한다.
  const params = new URLSearchParams({ term, media: 'music', entity: 'song', limit: '50' })
  const response = await fetch(`https://itunes.apple.com/search?${params}`)
  if (!response.ok) throw new Error('음악 검색 요청 실패')

  const data: unknown = await response.json()
  if (typeof data !== 'object' || data === null || !('results' in data)
    || !Array.isArray(data.results)) throw new Error('잘못된 음악 검색 응답')

  const results: MusicSearchResult[] = []
  for (const item of data.results) {
    if (typeof item !== 'object' || item === null || item.kind !== 'song'
      || typeof item.trackId !== 'number' || !Number.isFinite(item.trackId)
      || typeof item.trackName !== 'string' || !item.trackName.trim()
      || typeof item.artistName !== 'string' || !item.artistName.trim()) continue

    results.push({
      externalId: String(item.trackId),
      title: item.trackName,
      artist: item.artistName,
      ...(isImageUrl(item.artworkUrl100) ? { albumImageUrl: item.artworkUrl100 } : {}),
      ...(isReleaseDate(item.releaseDate) ? { releaseDate: item.releaseDate } : {}),
    })
    if (results.length === 50) break
  }
  return results
}
