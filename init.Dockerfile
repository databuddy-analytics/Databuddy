FROM oven/bun:1.4.1-slim AS pruner

WORKDIR /app

COPY . .

RUN bunx turbo@2.11.1 prune @databuddy/db --docker

FROM oven/bun:1.4.1-slim

WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN bun install --production --frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ .
COPY tsconfig ./tsconfig

ENV NODE_ENV=production

CMD ["sh", "-c", "while sleep 0.2; do printf '\\r'; done | script -qec 'bun run --cwd packages/db db:push' /tmp/db-push.log && ! grep -q 'changes were aborted' /tmp/db-push.log && bun --cwd packages/db src/clickhouse/setup.ts"]
