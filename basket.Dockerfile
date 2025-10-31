FROM oven/bun:1.3.0-debian AS build

WORKDIR /app

RUN apt-get update && apt-get install -y \
	python3 \
	make \
	g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json package.json
COPY apps/basket/package.json ./apps/basket/package.json
COPY packages/*/package.json ./packages/

COPY packages/ ./packages/

RUN bun install

COPY apps/basket/src ./apps/basket/src

ENV NODE_ENV=production

RUN bun build \
	--compile \
	--minify-whitespace \
	--minify-syntax \
	--target bun \
	--outfile server \
	--sourcemap \
	--bytecode \
	./apps/basket/src/index.ts

FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=build /app/server server

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 4000