FROM oven/bun:1.3.4-slim AS builder

WORKDIR /app

COPY package.json bun.lock turbo.json ./

COPY apps/ ./apps/
COPY packages/ ./packages/

RUN bun install --ignore-scripts

RUN bunx turbo build --filter=@databuddy/api...

FROM oven/bun:1.3.4-slim

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages ./packages

ENV NODE_ENV=production

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

WORKDIR /app/apps/api

CMD ["bun", "run", "src/index.ts"]