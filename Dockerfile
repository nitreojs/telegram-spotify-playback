FROM node:lts
WORKDIR /spotify-bot
COPY package.json tsconfig.json yarn.lock ./
RUN yarn install
COPY . .
RUN yarn build
CMD ["node", "."]