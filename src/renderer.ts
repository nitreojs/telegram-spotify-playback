import path from 'node:path'

import 'dotenv/config'

import { loadImage, Canvas, FontLibrary, Image } from 'skia-canvas'

import { Spotify } from './spotify'
import { deferAlbumType, isSingle, transformDate, transformTime } from './utils'

const spotify = new Spotify({
  accessToken: process.env.SPOTIFY_ACCESS_TOKEN,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN,
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
})

FontLibrary.use('SF UI', [path.resolve(__dirname, '..', 'fonts', 'SF UI', '*.otf')])

let me: Record<string, any>

export async function render (data: Record<string, any> | null, recent: Record<string, any>) {
  const canvas = new Canvas(1024, 240)
  const context = canvas.getContext('2d')

  const roundRect = (dx: number, dy: number, dw: number, dh: number, radius: number, fill = false) => {
    if (dw < 2 * radius) radius = dw / 2
    if (dh < 2 * radius) radius = dh / 2

    context.beginPath()
    context.moveTo(dx + radius, dy)

    context.arcTo(dx + dw, dy, dx + dw, dy + dh, radius)
    context.arcTo(dx + dw, dy + dh, dx, dy + dh, radius)
    context.arcTo(dx, dy + dh, dx, dy, radius)
    context.arcTo(dx, dy, dx + dw, dy, radius)

    if (fill) {
      context.fill()
    }

    context.closePath()

    return context
  }

  const drawRoundImage = (image: Image, dx: number, dy: number, dw: number, dh: number, radius = 10) => {
    const previousFillStyle = context.fillStyle

    context.fillStyle = 'black'

    context.save()

    roundRect(dx, dy, dw, dh, radius, true).clip()
    context.drawImage(image, dx, dy, dw, dh)

    context.restore()

    context.fillStyle = previousFillStyle
  }

  const circle = (dx: number, dy: number, radius: number, fill = false) => {
    context.beginPath()

    context.arc(dx, dy, radius, 0, 2 * Math.PI)

    if (fill) {
      context.fill()
    }

    context.closePath()
  }

  if (data === null) {
    // eslint-disable-next-line camelcase
    const { track, played_at } = recent.items[0]
    const album = track.album

    const playedAtUTC = new Date(played_at)
    const playedAt = new Date(playedAtUTC.getTime() + 1000 * 60 * 60 * 3)

    const thumbnail = await loadImage(album.images[0].url)

    /// blurred background
    const LEFT_OFFSET = 15

    context.filter = 'blur(20px)'
    context.drawImage(thumbnail,
      0 - LEFT_OFFSET * 2, // dx
      0 - thumbnail.height / 2 / 2 - LEFT_OFFSET, // dy: 160px up (we need a lot bigger background image)
      canvas.width + LEFT_OFFSET * 4, // dw: canvas.width, compensating LEFT_OFFSET
      thumbnail.height + LEFT_OFFSET * 4 // dh: same applies to here
    )
    context.filter = 'none'

    /// background but darker
    context.fillStyle = 'rgba(0, 0, 0, 0.2)'
    context.fillRect(0, 0, canvas.width, canvas.height)

    /// currently im not listening to anything!
    const TEXT = 'сейчас я ничего не слушаю!'
    const TEXT_OFFSET = 30

    context.shadowBlur = 10
    context.font = '700 28px SF UI'
    context.fillStyle = 'white'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(TEXT, canvas.width / 2, TEXT_OFFSET)
    context.shadowBlur = 0

    /// but here's latest track i've listened to
    const DESCRIPTION = 'но вот мой последний прослушанный трек'
    const DESCRIPTION_OFFSET = TEXT_OFFSET + 25

    context.shadowBlur = 10
    context.font = '300 16px SF UI'
    context.fillText(DESCRIPTION, canvas.width / 2, DESCRIPTION_OFFSET)

    /// track thumbnail
    const THUMBNAIL_OFFSET = 30

    const THUMBNAIL_WIDTH = canvas.height - THUMBNAIL_OFFSET * 4
    const THUMBNAIL_HEIGHT = canvas.height - THUMBNAIL_OFFSET * 4

    const THUMBNAIL_OFFSET_X = canvas.width / 2 - THUMBNAIL_WIDTH / 2
    const THUMBNAIL_OFFSET_Y = DESCRIPTION_OFFSET + 30

    context.shadowBlur = 30
    context.shadowColor = 'rgba(0, 0, 0, 0.5)'

    drawRoundImage(thumbnail,
      THUMBNAIL_OFFSET_X, // dx
      THUMBNAIL_OFFSET_Y, // dy
      THUMBNAIL_WIDTH, // dw: we need an image that fits out [320320] zone
      THUMBNAIL_HEIGHT, // dh: same applies to here
      10 // radius
    )

    context.shadowBlur = 0

    context.shadowBlur = 30
    context.shadowColor = 'rgba(0, 0, 0, 0.5)'

    /// track name
    const TRACK_NAME = track.name

    context.shadowBlur = 10
    context.font = '700 28px SF UI'
    context.textAlign = 'right'
    context.textBaseline = 'top'
    context.fillText(TRACK_NAME, THUMBNAIL_OFFSET_X - 30, THUMBNAIL_HEIGHT - 10)
    context.shadowBlur = 0

    /// track performers & album name
    const PERFORMERS = track.artists.map((artist: Record<string, any>) => artist.name).join(', ')
    const PERFORMERS_AND_ALBUM_NAME = `${PERFORMERS} — ${album.name}`

    context.shadowBlur = 10
    context.font = '300 20px SF UI'
    context.fillText(PERFORMERS_AND_ALBUM_NAME, THUMBNAIL_OFFSET_X - 30, THUMBNAIL_HEIGHT + 25)

    /// last listened at {time}
    const LAST_LISTENED_OFFSET_X = canvas.width / 2 + THUMBNAIL_WIDTH / 2 + 30
    const LAST_LISTENED_OFFSET_Y = THUMBNAIL_OFFSET_Y + THUMBNAIL_HEIGHT / 2

    context.font = '300 24px SF UI'
    context.textAlign = 'left'
    context.textBaseline = 'middle'

    const measure = context.measureText('слушал')

    context.fillText('слушал', LAST_LISTENED_OFFSET_X, LAST_LISTENED_OFFSET_Y)

    context.font = '500 24px SF UI'
    context.fillText(transformDate(playedAt), LAST_LISTENED_OFFSET_X + measure.width + 10, LAST_LISTENED_OFFSET_Y)

    const buffer = await canvas.toBuffer('png')

    return buffer
  }

  if (me === undefined) {
    me = (await spotify.call('me')) as Record<string, any>
  }

  const track = data.item
  const album = track.album

  const AVATAR = me.images[0].url

  const thumbnail = await loadImage(album.images[0].url)
  const avatar = await loadImage(AVATAR)

  /// blurred background
  const LEFT_OFFSET = 15

  context.filter = 'blur(20px)'
  context.drawImage(thumbnail,
    0 - LEFT_OFFSET * 2, // dx
    0 - thumbnail.height / 2 / 2 - LEFT_OFFSET, // dy: 160px up (we need a lot bigger background image)
    canvas.width + LEFT_OFFSET * 4, // dw: canvas.width, compensating LEFT_OFFSET
    thumbnail.height + LEFT_OFFSET * 4 // dh: same applies to here
  )
  context.filter = 'none'

  /// background but darker
  context.fillStyle = 'rgba(0, 0, 0, 0.3)'
  context.fillRect(0, 0, canvas.width, canvas.height)

  /// photo thumbnail
  const THUMBNAIL_OFFSET = 30

  const THUMBNAIL_WIDTH = canvas.height - THUMBNAIL_OFFSET * 2
  const THUMBNAIL_HEIGHT = canvas.height - THUMBNAIL_OFFSET * 2

  context.shadowBlur = 30
  context.shadowColor = 'rgba(0, 0, 0, 0.5)'

  drawRoundImage(thumbnail,
    THUMBNAIL_OFFSET, // dx
    THUMBNAIL_OFFSET, // dy
    THUMBNAIL_WIDTH, // dw: we need an image that fits out [320,320] zone
    THUMBNAIL_HEIGHT, // dh: same applies to here
    10 // radius
  )

  context.shadowBlur = 0

  /// spotify avatar

  const AVATAR_SIZE = 48
  const AVATAR_OFFSET = canvas.width - AVATAR_SIZE - 30

  context.shadowBlur = 10
  context.shadowColor = 'rgba(0, 0, 0, 0.2)'

  drawRoundImage(avatar,
    AVATAR_OFFSET,
    THUMBNAIL_OFFSET,
    AVATAR_SIZE,
    AVATAR_SIZE,
    Infinity
  )

  context.shadowBlur = 0

  /// spotify nickname
  const NICKNAME = me.display_name

  const NICKNAME_OFFSET = AVATAR_OFFSET - 30 / 2

  context.shadowBlur = 10
  context.font = '400 32px SF UI'
  context.fillStyle = 'white'
  context.textAlign = 'right'
  context.textBaseline = 'middle'

  const nicknameMeasure = context.measureText(NICKNAME)

  context.fillText(NICKNAME, NICKNAME_OFFSET, THUMBNAIL_OFFSET + AVATAR_SIZE / 2)
  context.shadowBlur = 0

  /// track name
  const TRACK_NAME_OFFSET = THUMBNAIL_OFFSET + THUMBNAIL_WIDTH + 30
  const TRACK_NAME = track.name

  context.shadowBlur = 10
  context.font = '700 32px SF UI'
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.fillText(TRACK_NAME, TRACK_NAME_OFFSET, THUMBNAIL_OFFSET, canvas.width - TRACK_NAME_OFFSET - 30 - nicknameMeasure.width - 15)
  context.shadowBlur = 0

  /// track performers & album name
  const PERFORMERS = track.artists.map((artist: Record<string, any>) => artist.name).join(', ')

  // const PERFORMERS_AND_ALBUM_NAME = `${PERFORMERS} — ${album.name}`
  const PERFORMERS_AND_ALBUM_NAME = isSingle(album) ? PERFORMERS : `${PERFORMERS} — ${album.name}`

  const TRACK_PERFORMERS_OFFSET = THUMBNAIL_OFFSET + 10 + 30

  context.shadowBlur = 10
  context.font = '300 24px SF UI'

  const paanMeasure = context.measureText(PERFORMERS_AND_ALBUM_NAME)
  context.fillText(PERFORMERS_AND_ALBUM_NAME, TRACK_NAME_OFFSET, TRACK_PERFORMERS_OFFSET)

  /// track album type
  if (!isSingle(album)) {
    const ALBUM_TYPE = deferAlbumType(album)

    context.font = '300 20px SF UI'
    context.shadowBlur = 15
    context.textBaseline = 'bottom'
    context.fillStyle = 'rgba(255, 255, 255, 0.5)'

    context.fillText(ALBUM_TYPE,
      TRACK_NAME_OFFSET + paanMeasure.width + 15,
      TRACK_PERFORMERS_OFFSET + paanMeasure.actualBoundingBoxDescent - 1 /** i hate linux */
    )
  }

  context.font = '700 32px SF UI'
  context.textAlign = 'left'
  context.textBaseline = 'top'

  /// track line
  const LINE_OFFSET = canvas.height - 30 - 5

  const LINE_WIDTH = canvas.width - TRACK_NAME_OFFSET - 30
  const LINE_HEIGHT = 5

  const progress = data.progress_ms
  const duration = track.duration_ms

  const PLAYED_LINE_WIDTH = (progress / duration) * LINE_WIDTH

  /// / left line
  context.shadowBlur = 10
  context.fillStyle = 'rgba(255, 255, 255, 0.6)'

  roundRect(TRACK_NAME_OFFSET, LINE_OFFSET, LINE_WIDTH, LINE_HEIGHT, 3, true)

  context.fillStyle = 'white'

  /// / played line
  context.shadowBlur = 0
  context.shadowColor = 'rgba(0, 0, 0, 0.5)'

  roundRect(TRACK_NAME_OFFSET, LINE_OFFSET, PLAYED_LINE_WIDTH, LINE_HEIGHT, 3, true)

  /// played dot
  context.shadowBlur = 10
  context.shadowColor = 'rgba(0, 0, 0, 0.3)'
  context.fillStyle = 'white'

  circle(TRACK_NAME_OFFSET + PLAYED_LINE_WIDTH, LINE_OFFSET + LINE_HEIGHT / 2, 5, true)

  /// track time (elapsed)
  const ELAPSED_TIME = transformTime(progress)
  const ELAPSED_TIME_OFFSET = LINE_OFFSET - 5

  context.shadowBlur = 6
  context.font = '400 16px SF UI'
  context.fillStyle = 'rgba(255, 255, 255, 0.7)'
  context.textAlign = 'left'
  context.textBaseline = 'bottom'
  context.fillText(ELAPSED_TIME, TRACK_NAME_OFFSET, ELAPSED_TIME_OFFSET)

  /// track time
  const LEFT_TIME = transformTime(duration)
  const LEFT_TIME_OFFSET = canvas.width - 30

  context.textAlign = 'right'
  context.fillText(LEFT_TIME, LEFT_TIME_OFFSET, ELAPSED_TIME_OFFSET)

  const buffer = await canvas.toBuffer('png')

  return buffer
}
