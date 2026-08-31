FROM oven/bun:1.3.14-slim AS pruner

WORKDIR /app

COPY . .

RUN bunx turbo prune @databuddy/links --docker

FROM oven/bun:1.3.14-slim AS builder

WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile --ignore-scripts

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

FROM oven/bun:1.3.14-slim AS smoke

WORKDIR /app

COPY --from=builder /app/server server
COPY --from=pruner /app/scripts/smoke-health.ts smoke.ts

# Boots the compiled binary and drives the health route. Catches minification
# breakage before an image can be pushed; the dummy URLs make probes fail fast.
RUN (APP_ENV=smoke \
	DATABASE_URL=postgres://smoke:smoke@127.0.0.1:9/smoke \
	REDIS_URL=redis://127.0.0.1:9 \
	CLICKHOUSE_URL=http://127.0.0.1:9 \
	./server &) && \
	ok=""; \
	for attempt in $(seq 1 40); do \
	if bun smoke.ts http://127.0.0.1:2500/health/status; then ok=1; break; fi; \
	sleep 0.5; \
	done; \
	[ -n "$ok" ]

FROM oven/bun:1.3.14-distroless

WORKDIR /app

COPY --from=smoke /app/server server

ENV NODE_ENV=production

EXPOSE 2500

ENTRYPOINT []
CMD ["./server"]
