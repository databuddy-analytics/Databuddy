FROM oven/bun:1.3.11-slim AS build

WORKDIR /app

COPY package.json package.json
COPY bun.lock bun.lock
COPY apps/uptime/package.json ./apps/uptime/package.json
COPY packages/*/package.json ./packages/

COPY packages/ ./packages/

RUN bun install --ignore-scripts

COPY apps/uptime/src ./apps/uptime/src
COPY apps/uptime/tsconfig.json ./apps/uptime/tsconfig.json

ENV NODE_ENV=production

RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --target bun \
    --outfile /app/server \
    --sourcemap \
    --bytecode \
    ./apps/uptime/src/index.ts

FROM oven/bun:1.3.11-distroless

WORKDIR /app

COPY --from=build /app/server server

ENV NODE_ENV=production

EXPOSE 4000

ENTRYPOINT []
CMD ["./server"]
