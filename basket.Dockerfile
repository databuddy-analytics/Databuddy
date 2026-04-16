FROM oven/bun:1.3.11-slim AS build

WORKDIR /app

COPY package.json package.json
COPY bun.lock bun.lock
COPY apps/basket/package.json ./apps/basket/package.json
COPY packages/*/package.json ./packages/

COPY packages/ ./packages/

RUN bun install --ignore-scripts

COPY apps/basket/src ./apps/basket/src
COPY apps/basket/tsconfig.json ./apps/basket/tsconfig.json

ENV NODE_ENV=production

WORKDIR /app/apps/basket

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

EXPOSE 4000

ENTRYPOINT []
CMD ["./server"]
