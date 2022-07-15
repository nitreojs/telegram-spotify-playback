import 'dotenv/config'

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { InlineKeyboard, MediaSource, Telegram } from 'puregram'
import { TelegramInlineQueryResult } from 'puregram/generated'

import * as YAML from 'yaml'
import cron from 'node-cron'

import { Color, Logger, TextStyle } from '@starkow/logger'

import { render } from './renderer'

import { getDeclination, isEP, isSingle, transformArtists, transformDate } from '../utils'

import { Spotify } from '../spotify'
import * as SpotifyTypes from '../spotify/types'

import { Lastfm } from '../lastfm'
import * as LastfmTypes from '../lastfm/types'

import { YamlData } from '../types'

interface GenerateMessageParams {
  track: SpotifyTypes.Track
  linkArtists?: boolean
  isLiked?: boolean
  scrobbled?: number
}

const telegram = Telegram.fromToken(process.env.TELEGRAM_BOT_TOKEN)

const spotify = new Spotify({
  accessToken: process.env.SPOTIFY_ACCESS_TOKEN,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN,
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
})

const lastfm = new Lastfm({
  key: process.env.LASTFM_API_KEY
})

const DATA_YML_PATH = resolve(__dirname, '..', '..', 'data', 'data.yml')

const deferAlbumTypeName = (album: Record<string, any>) => (
  isEP(album) ? 'EP' : 'Альбом'
)

const getKeyboard = (track: Record<string, any>) => {
  const buttons = [
    InlineKeyboard.urlButton({
      text: `${transformArtists(track.artists)} — ${track.name}`,
      url: `https://song.link/s/${track.id}`
    })
  ]

  return InlineKeyboard.keyboard(buttons)
}

/** Reads data from data/data.yml */
const load = async () => {
  const data = await readFile(DATA_YML_PATH, { encoding: 'utf8' })

  return YAML.parse(data) as YamlData
}

/** Writes data to data/data.yml */
const write = async (data: YamlData) => {
  const yaml = YAML.stringify(data)

  Logger.create('yaml update', Color.Yellow)(yaml)

  await writeFile(DATA_YML_PATH, yaml)
}

/** Generates message that will be shown in a post or after clicking on an inline query */
const generateMessage = (params: GenerateMessageParams) => {
  const { track, linkArtists, isLiked } = params

  const lines = [
    `🎵 ${transformArtists(track.artists, linkArtists)} — [${track.name}](${track.external_urls.spotify}) ${isLiked ? '❤️' : ''}`
  ]

  if (!isSingle(track.album)) {
    lines.push(`📀 *${deferAlbumTypeName(track.album)}*: [${track.album.name}](${track.album.external_urls.spotify})`)
  }

  if (params.scrobbled !== undefined) {
    lines.push(`🔢 Я слушал этот трек \`${params.scrobbled}\` ${getDeclination(params.scrobbled, ['раз', 'раза', 'раз'])}`)
  }

  lines.push(`🎧 [Трек на других площадках](https://song.link/s/${track.id})`)

  return lines.join('\n')
}

/** Generates `{ [track-id: number]: boolean }` object containing whether `track-id` is liked or not */
const getLikedData = async (ids: string[]) => {
  const url = `me/tracks/contains?ids=${ids.join(',')}`

  const check = await spotify.call<boolean[]>(url)

  if (check === null) {
    return {}
  }

  const isLikedData: Record<string, boolean> = {}

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const isLiked = check[i]

    isLikedData[id] = isLiked
  }

  return isLikedData
}

// INFO: generating every 10 seconds
cron.schedule('*/10 * * * * *', async () => {
  try {
    const yaml = await load()

    const { channels } = yaml

    if (channels === null) {
      Logger.create('yaml is lacking of data!')(yaml)

      return
    }

    const [data, recent] = await Promise.all([
      spotify.call<SpotifyTypes.CurrentlyPlaying>('me/player/currently-playing'),
      spotify.call<SpotifyTypes.RecentlyPlayed>('me/player/recently-played')
    ])

    if (recent === null) {
      throw new Error('recent is null')
    }

    const buffer = await render(data, recent)

    const track = data?.item as SpotifyTypes.Track ?? recent.items[0].track

    const likedData = await getLikedData([track.id])

    const currentScrobblingTrackData = await lastfm.call<LastfmTypes.RecentTracks>('user.getRecentTracks', {
      user: process.env.LASTFM_USERNAME,
      limit: 1
    })

    const currentScrobblingTrack = currentScrobblingTrackData.recenttracks.track[0]

    const scrobblesData = await lastfm.call<LastfmTypes.TrackInfo>('track.getInfo', {
      artist: currentScrobblingTrack.artist['#text'],
      track: currentScrobblingTrack.name,
      username: process.env.LASTFM_USERNAME
    })

    const params: GenerateMessageParams = {
      track,
      linkArtists: true,
      isLiked: likedData[track.id]
    }

    if (scrobblesData.error === undefined) {
      params.scrobbled = +scrobblesData.track.userplaycount
    }

    const message = generateMessage(params)
    const keyboard = getKeyboard(track)

    for (const channel of channels) {
      await telegram.api.editMessageMedia({
        chat_id: channel.id,
        message_id: channel.message_id,

        media: {
          media: MediaSource.buffer(buffer),
          type: 'photo',
          caption: message,
          parse_mode: 'markdown'
        },

        reply_markup: keyboard
      })
    }
  } catch (error) {
    console.error(error)
  }
})

/** Post was made in a channel, maybe containing /create command */
telegram.updates.on('channel_post', async (context, next) => {
  if (!context.hasText) {
    return next()
  }

  if (/^\/create$/i.test(context.text as string)) {
    await context.delete()

    const [data, recent] = await Promise.all([
      spotify.call<SpotifyTypes.CurrentlyPlaying>('me/player/currently-playing'),
      spotify.call<SpotifyTypes.RecentlyPlayed>('me/player/recently-played')
    ])

    if (recent === null) {
      throw new Error('recent is null')
    }

    const buffer = await render(data, recent)

    const track = data?.item as SpotifyTypes.Track ?? recent.items[0].track

    const message = generateMessage({ track, linkArtists: true })
    const keyboard = getKeyboard(track)

    const params = {
      caption: message,
      parse_mode: 'markdown',
      reply_markup: keyboard
    }

    const sentMessage = await context.sendPhoto(MediaSource.buffer(buffer), params)

    const { channels } = await load()

    channels.push({
      id: sentMessage.chatId as number,
      message_id: sentMessage.id
    })

    await write({ channels })
  }

  return next()
})

/** @<usernamebot> was typed in a text field */
telegram.updates.on('inline_query', async (context) => {
  const [data, recent] = await Promise.all([
    spotify.call<SpotifyTypes.CurrentlyPlaying>('me/player/currently-playing'),
    spotify.call<SpotifyTypes.RecentlyPlayed>('me/player/recently-played')
  ])

  if (recent === null) {
    return
  }

  const result: TelegramInlineQueryResult[] = []

  const ids: string[] = []

  if (data !== null && data.item !== null) {
    ids.push(data.item.id)
  }

  for (const item of recent.items) {
    if (!ids.includes(item.track.id)) {
      ids.push(item.track.id)
    }
  }

  const likedData = await getLikedData(ids)

  result.push({
    type: 'article',
    id: 'title',
    title: 'ИСТОРИЯ ПРОСЛУШИВАНИЯ',
    input_message_content: {
      message_text: 'Я нажал на кнопку "ИСТОРИЯ ПРОСЛУШИВАНИЯ". Извините, *я дурачок*',
      parse_mode: 'markdown'
    }
  })

  if (data !== null) {
    const track = data.item as SpotifyTypes.Track
    const album = track.album

    const description = !isSingle(album)
      ? `${transformArtists(track.artists)} • ${album.name}`
      : `${transformArtists(track.artists)}`

    const liked = likedData[track.id]

    result.push({
      type: 'photo',
      id: track.id as string,
      photo_url: album.images[0].url,
      thumb_url: album.images[0].url,
      title: `▶️ ${track.name} ${liked ? '❤️' : ''}`,
      description,
      url: track.external_urls.spotify,
      caption: '🎧 *Сейчас я слушаю*\n' + generateMessage({ track, linkArtists: true, isLiked: liked }),
      parse_mode: 'markdown',
      disable_web_page_preview: true,
      // @ts-expect-error puregram
      reply_markup: getKeyboard(track)
    })
  }

  for (let i = 0; i < 10; i++) {
    const item = recent.items[i]

    // eslint-disable-next-line camelcase
    const { track, played_at } = item
    const album = track.album

    const playedAtUTC = new Date(played_at)
    const playedAt = new Date(playedAtUTC.getTime() + 1000 * 60 * 60 * 3)

    const description = !isSingle(album)
      ? `${transformArtists(track.artists)} • ${album.name} // слушал ${transformDate(playedAt)}`
      : `${transformArtists(track.artists)} // слушал ${transformDate(playedAt)}`

    const liked = likedData[track.id]

    result.push({
      type: 'photo',
      id: `${track.id}:${i}`,
      photo_url: album.images[0].url,
      thumb_url: album.images[0].url,
      title: `${track.name} ${liked ? '❤️' : ''}`,
      description,
      url: track.external_urls.spotify,
      caption: generateMessage({ track, linkArtists: true, isLiked: liked }),
      parse_mode: 'markdown',
      disable_web_page_preview: true,
      // @ts-expect-error puregram
      reply_markup: getKeyboard(track)
    })
  }

  return context.answerInlineQuery(result, {
    cache_time: 5,
    is_personal: true
  })
})

async function main () {
  await telegram.updates.startPolling()
  Logger.create('bot', Color.Cyan)(Logger.color('@' + telegram.bot.username, TextStyle.Underline, Color.Blue), 'started!')
}

main().catch((error) => Logger.create('bot', Color.Red).error(error))
