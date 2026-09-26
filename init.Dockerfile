FROM oven/bun:1.4.1-slim

WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY packages ./packages
COPY apps ./apps
COPY tsconfig ./tsconfig

RUN bun install --frozen-lockfile --ignore-scripts

ENV NODE_ENV=production

CMD ["sh", "-c", "while sleep 0.2; do printf '\\r'; done | script -qec 'bun run --cwd packages/db db:push' /tmp/db-push.log && ! grep -q 'changes were aborted' /tmp/db-push.log && bun --cwd packages/db src/clickhouse/setup.ts"]
