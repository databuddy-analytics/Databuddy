FROM oven/bun:1.3.14-slim AS pruner

WORKDIR /app

COPY . .

RUN bunx turbo prune @databuddy/dashboard --docker

FROM oven/bun:1.3.14-slim AS builder

WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN bun install --ignore-scripts

COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig ./tsconfig
COPY turbo.json turbo.json

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_VALIDATION=true

# Build-time defaults keep the image buildable. Override these with real public
# URLs when building environment-specific dashboard images.
ARG NEXT_PUBLIC_API_URL=https://api.databuddy.cc
ARG NEXT_PUBLIC_APP_URL=https://app.databuddy.cc
ARG NEXT_PUBLIC_BASKET_URL=https://basket.databuddy.cc
ARG NEXT_PUBLIC_STATUS_URL=https://status.databuddy.cc

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_BASKET_URL=$NEXT_PUBLIC_BASKET_URL
ENV NEXT_PUBLIC_STATUS_URL=$NEXT_PUBLIC_STATUS_URL
ENV API_URL=$NEXT_PUBLIC_API_URL
ENV BASKET_URL=$NEXT_PUBLIC_BASKET_URL
ENV DASHBOARD_URL=$NEXT_PUBLIC_APP_URL
ENV STATUS_URL=$NEXT_PUBLIC_STATUS_URL

RUN DATABASE_URL=postgres://databuddy:databuddy@localhost:5432/databuddy \
	REDIS_URL=redis://localhost:6379 \
	BULLMQ_REDIS_URL=redis://localhost:6379 \
	CLICKHOUSE_URL=http://default:@localhost:8123/databuddy_analytics \
	BETTER_AUTH_URL=$NEXT_PUBLIC_APP_URL \
	BETTER_AUTH_SECRET=build-time-placeholder-secret \
	RESEND_API_KEY=build-time-placeholder \
	AUTUMN_SECRET_KEY=build-time-placeholder \
	bunx turbo run build --filter=@databuddy/dashboard...

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
	&& useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/public ./apps/dashboard/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/dashboard/server.js"]
