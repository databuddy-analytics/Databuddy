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

# @databuddy/charts loads @resvg/resvg-js (a Rust native addon) at startup for
# server-side chart PNGs; its .node binary dlopens libgcc_s.so.1, which the
# distroless runtime omits. Bring it over from the Debian-based builder stage.
COPY --from=builder /usr/lib/x86_64-linux-gnu/libgcc_s.so.1 /usr/lib/x86_64-linux-gnu/libgcc_s.so.1

ENV NODE_ENV=production

EXPOSE 3010

ENTRYPOINT []
CMD ["./server"]
