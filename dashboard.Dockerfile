FROM oven/bun:1.3.11-slim AS pruner

WORKDIR /app

COPY . .

RUN bunx turbo prune @databuddy/dashboard @databuddy/tracker --docker

FROM oven/bun:1.3.11-slim AS builder

WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN bun install --ignore-scripts

COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json

ARG BETTER_AUTH_URL=http://localhost:3000
ARG NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_BASKET_URL=http://localhost:4000
ARG NEXT_PUBLIC_SCRIPT_URL=http://localhost:3000/databuddy.js

ENV NODE_ENV=production
ENV DATABASE_URL=postgres://databuddy:databuddy@localhost:5432/databuddy
ENV REDIS_URL=redis://localhost:6379
ENV BETTER_AUTH_SECRET=build-only-secret
ENV BETTER_AUTH_URL=${BETTER_AUTH_URL}
ENV NEXT_PUBLIC_BETTER_AUTH_URL=${NEXT_PUBLIC_BETTER_AUTH_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_BASKET_URL=${NEXT_PUBLIC_BASKET_URL}
ENV NEXT_PUBLIC_SCRIPT_URL=${NEXT_PUBLIC_SCRIPT_URL}
ENV GITHUB_CLIENT_ID=build-only-github-client
ENV GITHUB_CLIENT_SECRET=build-only-github-secret
ENV GOOGLE_CLIENT_ID=build-only-google-client
ENV GOOGLE_CLIENT_SECRET=build-only-google-secret
ENV RESEND_API_KEY=build-only-resend-key

RUN bunx turbo build --filter=@databuddy/dashboard...
RUN cd packages/tracker && bun run build

FROM oven/bun:1.3.11-slim

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/dashboard ./apps/dashboard
COPY --from=builder /app/packages ./packages

ENV NODE_ENV=production

EXPOSE 3000

WORKDIR /app/apps/dashboard

CMD ["bun", "run", "start"]
