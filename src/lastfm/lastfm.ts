import { fetch } from 'undici'

interface LastfmOptions {
  key: string
}

interface _CallParams {
  method: string

  [key: string]: any
}

export class Lastfm {
  public baseApiUrl = 'https://ws.audioscrobbler.com/2.0'

  // eslint-disable-next-line no-useless-constructor
  constructor (private options: LastfmOptions) { }

  public async call (method: string, params?: Record<string, any>) {
    return this._call({ method, ...params })
  }

  private async _call (params: _CallParams) {
    const { method, ...rawBody } = params

    const body = {
      method,
      api_key: this.options.key,
      format: 'json',
      ...rawBody
    }

    const url = `${this.baseApiUrl}/?${new URLSearchParams(body)}`

    const response = await fetch(url, { method: 'GET' })
    const json = await response.json() as Record<string, any>

    return json
  }
}
