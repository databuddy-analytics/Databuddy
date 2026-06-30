FROM oven/bun:1.3.14-slim

WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY packages ./packages
COPY apps ./apps

RUN bun install --ignore-scripts

ENV NODE_ENV=production

CMD ["sh", "-c", "bun run --cwd packages/db db:push && bun --cwd packages/db src/clickhouse/setup.ts"]
