declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      SPOTIFY_CLIENT_ID: string
      SPOTIFY_CLIENT_SECRET: string
      SPOTIFY_ACCESS_TOKEN: string
      SPOTIFY_REFRESH_TOKEN: string
      SPOTIFY_REDIRECT_URI: string

      TELEGRAM_BOT_TOKEN: string

      LASTFM_API_KEY: string
    }
  }
}

export interface YamlDataChannel {
  id: number
  message_id: number
}

export interface YamlData {
  channels: YamlDataChannel[]
}
