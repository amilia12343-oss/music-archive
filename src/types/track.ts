export type Track = {
  id: string
  title: string
  artist: string
  albumImageUrl?: string
  releaseDate?: string
}

export type TrackInput = Omit<Track, 'id'>

export type EraTrack = {
  eraId: string
  trackId: string
}
