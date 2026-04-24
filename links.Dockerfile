FROM oven/bun:1.3.11-slim AS pruner

WORKDIR /app

COPY . .

RUN bunx turbo prune @databuddy/links --docker

FROM oven/bun:1.3.11-slim AS builder

WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN bun install --ignore-scripts

COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json

ENV NODE_ENV=production

WORKDIR /app/apps/links

RUN bun build \
	--compile \
	--production \
	--minify \
	--sourcemap \
	--bytecode \
	--define 'process.env.NODE_ENV="production"' \
	--outfile /app/server \
	./src/index.ts

FROM oven/bun:1.3.11-distroless

WORKDIR /app

COPY --from=builder /app/server server

ENV NODE_ENV=production

EXPOSE 2500

ENTRYPOINT []
CMD ["./server"]
