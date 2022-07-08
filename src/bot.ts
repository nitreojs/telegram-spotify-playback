import 'dotenv/config'

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { InlineKeyboard, Telegram } from 'puregram'
import { TelegramInlineQueryResult } from 'puregram/lib/telegram-interfaces'

import * as YAML from 'yaml'
import cron from 'node-cron'

import { isEP, isSingle, render } from './renderer'

import { Spotify } from './spotify'
import { Lastfm } from './lastfm'

import { Color, Logger, TextStyle } from './logger'
import { YamlData } from './types'

interface GenerateMessageParams {
  track: Record<string, any>
  linkArtists?: boolean
  isLiked?: boolean
  scrobbled?: number
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN as string
const IDS = (process.env.TELEGRAM_CHANNEL_IDS as string).split(',').map(Number)

const telegram = Telegram.fromToken(TOKEN)

const spotify = new Spotify({
  accessToken: process.env.SPOTIFY_ACCESS_TOKEN as string,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN as string,
  clientId: process.env.SPOTIFY_CLIENT_ID as string,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET as string
})

const lastfm = new Lastfm({
  key: process.env.LASTFM_API_KEY as string
})

const DATA_YML_PATH = resolve(__dirname, '..', 'data', 'data.yml')

const getDeclination = (n: number, forms: [string, string, string]) => {
  const pr = Intl.PluralRules('ru-RU')
  const rule = pr.select(n)

  console.log({ pr, rule })

  if (rule === 'one') {
    return forms[0]
  }

  if (rule === 'two') {
    return forms[1]
  }

  return forms[2]
}

const transformArtists = (artists: Record<string, any>[], linkArtists = false) => (
  artists.map(
    (artist: Record<string, any>) => linkArtists ? `[${artist.name}](${artist.external_urls.spotify})` : artist.name
  ).join(', ')
)

const deferAlbumTypeName = (album: Record<string, any>) => (
  isEP(album) ? 'EP' : 'Альбом'
)

const pad = (n: any) => String(n).padStart(2, '0')

const transformTime = (date: Date) => {
  const day = date.getDate()
  const monthN = date.getMonth() + 1

  const hours = date.getHours()
  const minutes = date.getMinutes()

  const month = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][monthN]

  return `${day} ${month} в ${pad(hours)}:${pad(minutes)}`
}

const getKeyboard = (track: Record<string, any>) => {
  const buttons = [
    InlineKeyboard.urlButton({
      text: `${transformArtists(track.artists)} — ${track.name}`,
      url: `https://song.link/s/${track.id}`
    })
  ]

  return InlineKeyboard.keyboard(buttons)
}

const load = async () => {
  const data = await readFile(DATA_YML_PATH, { encoding: 'utf8' })

  return YAML.parse(data) as YamlData
}

const write = async (data: YamlData) => {
  const yaml = YAML.stringify(data)

  Logger.create('yaml update', Color.Yellow)(yaml)

  await writeFile(DATA_YML_PATH, yaml)
}

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

const getLikedData = async (ids: string[]) => {
  const check = (await spotify.call(`me/tracks/contains?ids=${ids.join(',')}`)) as boolean[]

  const isLikedData: Record<string, boolean> = {}

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const isLiked = check[i]

    isLikedData[id] = isLiked
  }

  return isLikedData
}

let loggedFailure = false

// INFO: generating every 10 seconds
cron.schedule('*/10 * * * * *', async () => {
  const yaml = await load()

  const { channels } = yaml

  if (channels === null) {
    if (!loggedFailure) {
      Logger.create('yaml is lacking of data!')(yaml)

      loggedFailure = true
    }

    return
  }

  const [data, recent] = await Promise.all([
    spotify.call('me/player/currently-playing'),
    spotify.call('me/player/recently-played')
  ])

  if (recent === null) {
    throw new Error('recent is null')
  }

  const buffer = await render(data, recent)

  const track = data === null ? recent.items[0].track : data.item

  const likedData = await getLikedData([track.id])

  const scrobblesData = await lastfm.call('track.getInfo', {
    artist: transformArtists(track.artists),
    track: track.name,
    username: 'starkowdev'
  })

  const params: GenerateMessageParams = {
    track,
    linkArtists: true,
    isLiked: likedData[track.id]
  }

  if (scrobblesData.error === undefined) {
    params.scrobbled = +scrobblesData.track.userplaycount
  }

  console.log(1)

  const message = generateMessage(params)

  console.log(2)

  const keyboard = getKeyboard(track)

  console.log(3)

  console.log(message, keyboard)

  for (const channel of channels) {
    console.log(channel)

    await telegram.api.editMessageMedia({
      chat_id: channel.id,
      message_id: channel.message_id,

      media: {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        media: buffer,
        type: 'photo',
        caption: message,
        parse_mode: 'markdown'
      },

      reply_markup: keyboard
    })

    console.log('channel sent')
  }
})

telegram.updates.on('channel_post', async (context) => {
  if (!IDS.includes(context.chatId as number)) {
    return
  }

  if (!context.hasText) {
    return
  }

  if (/^\/create$/i.test(context.text as string)) {
    await context.deleteMessage()

    const [data, recent] = await Promise.all([
      spotify.call('me/player/currently-playing'),
      spotify.call('me/player/recently-played')
    ])

    if (recent === null) {
      throw new Error('recent is null')
    }

    const buffer = await render(data, recent)

    const track = data === null ? recent.items[0].track : data.item

    const message = generateMessage({ track, linkArtists: true })
    const keyboard = getKeyboard(track)

    const params = {
      caption: message,
      parse_mode: 'markdown',
      reply_markup: keyboard
    }

    const sentMessage = await context.sendPhoto(buffer, params)

    const { channels } = await load()

    channels.push({
      id: sentMessage.chatId as number,
      message_id: sentMessage.id
    })

    await write({ channels })
  }
})

telegram.updates.on('inline_query', async (context) => {
  const [data, recent] = await Promise.all([
    spotify.call('me/player/currently-playing'),
    spotify.call('me/player/recently-played')
  ])

  if (recent === null) {
    return
  }

  const isCurrentlyListening = data !== null

  const result: TelegramInlineQueryResult[] = []

  const ids: string[] = []

  if (data !== null) {
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

  if (isCurrentlyListening) {
    const track = data.item
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
      ? `${transformArtists(track.artists)} • ${album.name} // слушал ${transformTime(playedAt)}`
      : `${transformArtists(track.artists)} // слушал ${transformTime(playedAt)}`

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
