FROM oven/bun:1.3.4-slim AS build

WORKDIR /app

COPY package.json package.json
COPY apps/uptime/package.json ./apps/uptime/package.json
COPY packages/*/package.json ./packages/

COPY packages/ ./packages/

RUN bun install

COPY apps/uptime/src ./apps/uptime/src

ENV NODE_ENV=production

RUN bun build \
	--compile \
	--minify \
	--target bun \
	--outfile server \
	--sourcemap \
	--bytecode \
	./apps/uptime/src/index.ts

FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=build /app/server server

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 4000
