FROM oven/bun:1.3.14-slim AS pruner

WORKDIR /app

COPY . .

RUN bunx turbo prune @databuddy/insights --docker

FROM oven/bun:1.3.14-slim AS builder

WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN bun install --ignore-scripts

COPY --from=pruner /app/out/full/ .
COPY tsconfig tsconfig
COPY turbo.json turbo.json

ENV NODE_ENV=production

RUN bunx turbo run build --filter=@databuddy/insights...

WORKDIR /app/apps/insights

RUN bun build \
	--compile \
	--production \
	--minify \
	--sourcemap \
	--bytecode \
	--define 'process.env.NODE_ENV="production"' \
	--outfile /app/server \
	./src/index.ts

FROM oven/bun:1.3.14-distroless

WORKDIR /app

COPY --from=builder /app/server server

ENV NODE_ENV=production
ENV BUN_CONFIG_MAX_HTTP_REQUESTS=16384

EXPOSE 4002

USER 1000:1000

ENTRYPOINT []
CMD ["./server"]
