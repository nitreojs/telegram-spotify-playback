FROM node:slim
RUN apt-get update && apt-get install -y -q --no-install-recommends libfontconfig1
WORKDIR /spotify-bot
COPY package.json tsconfig.json yarn.lock ./
RUN yarn install
COPY . .
RUN yarn build
CMD ["node", "."]