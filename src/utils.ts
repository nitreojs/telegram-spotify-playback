export const isAlbum = (album: Record<string, any>) => {
  return album.album_type === 'album' && album.type === 'album'
}

export const isEP = (album: Record<string, any>) => {
  return album.album_type === 'single' && album.type === 'album' && album.total_tracks > 1
}

export const isSingle = (album: Record<string, any>) => {
  return !isAlbum(album) && !isEP(album)
}

export const transformTime = (ms: number) => {
  let seconds = Math.round(ms / 1000)
  const minutes = Math.floor(seconds / 60)

  seconds -= 60 * minutes

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const pad = (data: any) => data.toString().padStart(2, '0')

export const transformDate = (date: Date) => (
  `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} в ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
)

export const deferAlbumType = (album: Record<string, any>) => {
  if (isAlbum(album)) {
    return 'Album'
  }

  if (isEP(album)) {
    return 'EP'
  }

  return 'Single'
}
