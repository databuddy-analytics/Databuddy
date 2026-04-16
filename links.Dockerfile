FROM oven/bun:1.3.11-slim AS build

WORKDIR /app

COPY package.json package.json
COPY bun.lock bun.lock
COPY apps/links/package.json ./apps/links/package.json
COPY packages/*/package.json ./packages/

COPY packages/ ./packages/

RUN bun install --ignore-scripts

COPY apps/links/src ./apps/links/src
COPY apps/links/tsconfig.json ./apps/links/tsconfig.json

ENV NODE_ENV=production

WORKDIR /app/apps/links

RUN bun build \
	--compile \
	--minify-whitespace \
	--minify-syntax \
	--target bun \
	--outfile /app/server \
	--sourcemap \
	--bytecode \
	./src/index.ts

FROM oven/bun:1.3.11-distroless

WORKDIR /app

COPY --from=build /app/server server

ENV NODE_ENV=production

EXPOSE 2500

ENTRYPOINT []
CMD ["./server"]
