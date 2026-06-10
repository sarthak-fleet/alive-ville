# Aliveville: 3D client (vite build) + sim server (tsx) in one container.
FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:3d

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false
# server runtime needs source (tsx), worlds, fixtures, and the built client
COPY src ./src
COPY worlds ./worlds
COPY fixtures ./fixtures
COPY --from=build /app/dist/web3d ./dist/web3d

ENV PORT=8080
ENV WEB_ROOT=./dist/web3d
# session autosaves live here — mount a volume to survive redeploys
VOLUME /app/tmp
EXPOSE 8080
CMD ["npx", "tsx", "src/server.ts"]
