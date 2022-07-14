FROM node:lts-slim AS build
RUN apt-get update && apt-get install -y -q --no-install-recommends libfontconfig1
WORKDIR /app
COPY ["package.json", "tsconfig.json", "yarn.lock", "./"]
RUN yarn
ADD . .
RUN yarn build

FROM node:lts-slim AS production
RUN apt-get update && apt-get install -y -q --no-install-recommends libfontconfig1
WORKDIR /app
COPY ["package.json", "yarn.lock", "./"]
RUN yarn --prod
COPY fonts fonts
COPY --from=build /app/dist dist
CMD ["yarn", "start"]