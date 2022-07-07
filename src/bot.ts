import 'dotenv/config'

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { InlineKeyboard, Telegram } from 'puregram'
import { stripIndents } from 'common-tags'

import * as YAML from 'yaml'
import cron from 'node-cron'

import { isEP, isSingle, render } from './renderer'

import { Spotify } from './spotify'
import { Color, Logger, TextStyle } from './logger'
import { YamlData } from './types'

const TOKEN = process.env.TELEGRAM_BOT_TOKEN as string
const IDS = (process.env.TELEGRAM_CHANNEL_IDS as string).split(',').map(Number)

const telegram = Telegram.fromToken(TOKEN)

const spotify = new Spotify({
  accessToken: process.env.SPOTIFY_ACCESS_TOKEN!,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN!,
  clientId: process.env.SPOTIFY_CLIENT_ID!,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET!
})

const DATA_YML_PATH = resolve(__dirname, '..', 'data', 'data.yml')

const transformArtists = (artists: Record<string, any>[], linkArtists: boolean = false) => (
  artists.map(
    (artist: Record<string, any>) => linkArtists ? `[${artist.name}](${artist.external_urls.spotify})` : artist.name
  ).join(', ')
)

const deferAlbumTypeName = (album: Record<string, any>) => (
  isEP(album) ? 'EP' : 'Альбом'
)

const getKeyboard = (track: Record<string, any>) => {
  const buttons = [
    InlineKeyboard.urlButton({
      text: `${transformArtists(track.artists)} — ${track.name}`,
      url: `https://odesli.com/${track.external_urls.spotify}`
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

const generateMessage = (track: Record<string, any>, linkArtists: boolean = false) => (
  stripIndents`
    🎵 ${transformArtists(track.artists, linkArtists)} — [${track.name}](${track.external_urls.spotify})
    ${!isSingle(track.album) ? `📀 ${deferAlbumTypeName(track.album)}: [${track.album.name}](${track.album.external_urls.spotify})` : ''}
  `
)

let loggedFailure = false

/// generating every 10 seconds
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

  const buffer = await render(data, recent!)

  const track = data === null ? recent!.items[0].track : data.item

  const message = generateMessage(track, true)
  const keyboard = getKeyboard(track)

  for (const channel of channels) {
    await telegram.api.editMessageMedia({
      chat_id: channel.id,
      message_id: channel.message_id,
  
      media: {
        // @ts-ignore
        media: buffer,
        type: 'photo',
        caption: message,
        parse_mode: 'markdown'
      },
  
      reply_markup: keyboard,
    })
  }
})

telegram.updates.on('channel_post', async (context) => {
  if (!IDS.includes(context.chatId as number)) {
    return
  }

  if (!context.hasText) {
    return
  }

  if (/^\/create$/i.test(context.text!)) {
    await context.deleteMessage()
    
    const [data, recent] = await Promise.all([
      spotify.call('me/player/currently-playing'),
      spotify.call('me/player/recently-played')
    ])

    const buffer = await render(data, recent!)

    const track = data === null ? recent!.items[0].track : data.item

    const message = generateMessage(track, true)
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

async function main() {
  /// telegram
  await telegram.updates.startPolling()
  Logger.create('bot', Color.Cyan)(Logger.color('@' + telegram.bot.username!, TextStyle.Underline, Color.Blue), 'started!')
}

main().catch((error) => Logger.create('bot', Color.Red).error(error))
