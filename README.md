# telegram-spotify-playback

this bot allows you to "stream" your currently playing Spotify track in a single post

# usage

## with `docker run`

```sh
docker pull starkow/telegram-spotify-playback
# set up data.yml
# set up .env
docker run -d starkow/telegram-spotify-playback
```

## with `docker compose`

first of all, create `docker-compose.yml`. it may look similarly to this:

```yml
version: '3'

services:
  spotify-playback:
    image: starkow/telegram-spotify-playback
    restart: unless-stopped
    env_file:
      - .env
```

then, run this:

```sh
docker compose pull
# set up data.yml
# set up .env
docker compose up --build -d
```

## manual installation

```sh
git clone https://github.com/nitreojs/telegram-spotify-playback.git
cd telegram-spotify-playback
yarn # install dependencies
yarn build
# set up data.yml
# set up .env
node .
# you could also use pm2 or whatever you want
# executables are located at /dist/bot/index.js and /dist/server/index.js
```

# setting up `data.yml`

head straight to `data/` directory. you will find `data.sample.yml` file:

```yml
# Data about channels.
# Default: []
channels:
  -
```

it will contain an array of objects like this:

```
{ id: number; message_id: number }
```

as you can see from the filename, this file is a sample. simply remove `.sample` part from it,
that's all

# setting up `.env`

in the root folder you might find `.env.sample` file:

```env
SPOTIFY_CLIENT_ID=''
SPOTIFY_CLIENT_SECRET=''
SPOTIFY_ACCESS_TOKEN=''
SPOTIFY_REFRESH_TOKEN=''
SPOTIFY_REDIRECT_URI=http://localhost:8080/spotify
TELEGRAM_BOT_TOKEN=''
LASTFM_API_KEY=''
LASTFM_USERNAME=''
```

copy it into `.env` file (or simply rename it :P)

*wow, so many values. how do i fill them up?*

## getting Spotify keys

first, head straight to [Spotify Web API Dashboard](https://developer.spotify.com/dashboard/applications).
here you will need to log in & create an application.

here you will see **App Status**, **Client ID** and **Client Secret** (which is hidden by default).

grab **Client ID** and insert it after the `SPOTIFY_CLIENT_ID` key in `.env` file.

grab **Client Secret** (you will have to unhide it) and insert it after the `SPOTIFY_CLIENT_SECRET` key in `.env` file.

then, click "Edit Settings". find "Redirect URIs" field and insert `http://localhost:8080/spotify` here.

now starts the magic part. if you already have an access token and a refresh token, you're good to go.
if you dont, you will have to run `yarn start:server` (or `npm run start:server`) and go head to localhost:8080/login.
log in your Spotify account and then look at the console: here you will see values for `SPOTIFY_ACCESS_TOKEN` and `SPOTIFY_REFRESH_TOKEN`.
fill them in your `.env` file.

## getting Telegram data

go to [@BotFather](https://t.me/BotFather) and create a new bot via `/newbot` command. give it a name and,
most importantly, readable and simple username.

> **why?**
> you might be using inline mode frequently. if so, you will need to type your bot's @username. do you want it to be super complicated? i dont think so =)

after you've created a bot, use `/mybots` command to see the list of your bots, click on your bot,
click "Bot Settings" and click on "API Token". grab your bot's token and insert it as `TELEGRAM_BOT_TOKEN` in your `.env` file.
now, press "Back to Bot" > "Inline Mode" > "Turn on". **voila!** you've enabled inline mode.

create a channel (or use already created one). invite your bot here **as an admin**.

we're almost done!

## getting Lastfm data

[create an API account](https://www.last.fm/api/account/create) and get API key from here.
insert it in `LASTFM_APIKEY` in `.env` file

lastly, fill `LASTFM_USERNAME` as your Last.fm's username =)

**congratulations, setup is done!**

# fonts are missing!

yeah, that's true, i've removed fonts/ from here because i dont wanna get sued or whatever.
you need to somehow *get* SF UI font and put .otf files of it here: `~/fonts/SF UI/*.otf`

# what do i do now?

simply go to a channel where the bot is an admin and execute `/create` command. **that's it!**
