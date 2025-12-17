# Build stage
FROM oven/bun:1-slim AS builder


# Copy dependency files
COPY package.json bun.lock turbo.json /build/
COPY apps/dashboard /build/apps/dashboard
COPY packages/ /build/packages

WORKDIR /build
# Install dependencies
RUN bun install 

WORKDIR /build/packages/sdk

RUN bun run build

# build dashboard
WORKDIR /build/apps/dashboard
ENV NODE_ENV=production 
ENV REDIS_URL=redis://localhost
ENV DATABASE_URL=postgres://localhost
ENV CLICKHOUSE_URL=https://localhost
ENV NEXT_PUBLIC_API_URL=https://localhost
ENV PORT=3000
ENV BUN_ENV=production 
RUN bun install 
RUN bun run build

# Production stage
FROM oven/bun:1-slim

# Copy built files from builder
WORKDIR /app

COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/apps/dashboard ./apps/dashboard
COPY --from=builder /build/packages ./packages

# Set environment variables
ENV NODE_ENV=production 
ENV REDIS_URL=redis://localhost
ENV DATABASE_URL=postgres://localhost
ENV CLICKHOUSE_URL=https://localhost
ENV NEXT_PUBLIC_API_URL=https://localhost
ENV HOSTNAME=0.0.0.0
# Expose port
EXPOSE 3000

WORKDIR /app/apps/dashboard
# Start API
CMD ["bun", "run", "start"]