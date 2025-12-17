# ---- Base ----
# Use the official Bun image. Provides bun and necessary OS packages.
FROM oven/bun:1-slim AS base
WORKDIR /app

# ---- Builder ----
# Stage to build the application using the full workspace context.
FROM base AS builder
WORKDIR /app

# Copy necessary manifests first for potential caching
COPY package.json bun.lock ./
COPY turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
# Copy package.json for all packages - adjust if you have many and want more specific copying
COPY packages/ packages/

# Install ALL workspace dependencies, including dev dependencies needed for build
RUN bun install

# Copy the rest of the source code
COPY apps/ ./apps
# We already copied packages/ manifests, but copy full source now if needed for build
# If packages build steps are separate, you might not need full source here,
# but often safer to include it for the build.
COPY packages/ ./packages

# Build packages first
WORKDIR /app/packages/logger
RUN bun run build

# Build the API app
WORKDIR /app/apps/api
RUN bun run build

# ---- Production ----
# Final, minimal production stage.
FROM base AS production
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy root manifests needed for installation
COPY --from=builder /app/package.json /app/bun.lock ./

# Copy required workspace packages source code from the builder
# This copies ALL packages, as we can't easily prune without `turbo prune`.
COPY --from=builder /app/packages ./packages

# Copy the specific app's package.json (might be needed for context by install/run)
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

# Install ONLY production dependencies for the entire workspace context we copied.
# Bun will use the lockfile to figure out what's needed for the included packages/app.
RUN bun install --production

# Copy the built application artifact from the 'builder' stage.
# Adjust the source path if your build output differs.
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Expose the application port
EXPOSE 3000

# Define the command to run the application.
# The path is relative to the final WORKDIR /app.
CMD ["bun", "run", "apps/api/dist/index.js"]