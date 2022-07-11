import { fetch, RequestInit } from 'undici'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface SpotifyOptions {
  accessToken: string
  refreshToken: string
  clientId: string
  clientSecret: string
}

interface _CallParams {
  url: string
  forceUrl?: boolean
  method?: HttpMethod
  headers?: Record<string, any>
  body?: Record<string, any>
}

interface CallParams {
  httpMethod?: HttpMethod
  headers?: Record<string, any>

  [key: string]: any
}

export class Spotify {
  public baseApiUrl = 'https://api.spotify.com/v1'

  // eslint-disable-next-line no-useless-constructor
  constructor (private options: SpotifyOptions) { }

  public async revoke () {
    const json = (await this._call({
      url: 'https://accounts.spotify.com/api/token',
      forceUrl: true,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      method: 'POST',
      body: {
        grant_type: 'refresh_token',
        refresh_token: this.options.refreshToken
      }
    })) as Record<string, any>

    this.options.accessToken = json.access_token
  }

  private async _call (params: _CallParams): Promise<Record<string, any> | null> {
    const { url: rawUrl, method = 'GET', headers: rawHeaders, forceUrl = false, body } = params

    const url = forceUrl ? rawUrl : `${this.baseApiUrl}/${rawUrl}`

    const headers = rawHeaders ?? {
      Authorization: `Bearer ${this.options.accessToken}`
    }

    const requestParams: RequestInit = { method, headers }

    if (method !== 'GET') {
      requestParams.body = new URLSearchParams(body)
    }

    const response = await fetch(url, requestParams)

    try {
      const json = await response.json() as Record<string, any>

      if (json.error?.status === 401) { // need to revoke the token
        await this.revoke()

        return this._call(params)
      }

      return json
    } catch (error) { // failed to .json()
      return null
    }
  }

  public async call (method: string, params: CallParams = {}) {
    const { headers, ...body } = params

    return this._call({
      url: method,
      method: params.httpMethod ?? 'GET',
      body,
      headers
    })
  }
}
