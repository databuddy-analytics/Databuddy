FROM oven/bun:1.3.14-slim AS pruner

WORKDIR /app

COPY . .

RUN bunx turbo prune @databuddy/slack --docker

FROM oven/bun:1.3.14-slim AS builder

WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN bun install --ignore-scripts

COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json
COPY tsconfig tsconfig

ENV NODE_ENV=production

RUN bunx turbo run build --filter=@databuddy/slack...

WORKDIR /app/apps/slack

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

EXPOSE 3010

ENTRYPOINT []
CMD ["./server"]
