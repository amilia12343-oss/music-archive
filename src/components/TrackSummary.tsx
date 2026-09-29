import { useState } from 'react'
import type { TrackInput } from '../types/track'

export default function TrackSummary({ track }: { track: TrackInput }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return (
    <span className="track-summary">
      {track.albumImageUrl && failedUrl !== track.albumImageUrl ? (
        <img src={track.albumImageUrl} alt="" loading="lazy"
          onError={() => setFailedUrl(track.albumImageUrl ?? null)} />
      ) : <span className="album-placeholder" aria-label="앨범 이미지 없음">♪</span>}
      <span className="track-info">
        <strong>{track.title}</strong>
        <span className="track-artist">{track.artist}</span>
        {track.releaseDate && <span className="track-artist">발매 {track.releaseDate.slice(0, 4)}년</span>}
      </span>
    </span>
  )
}
