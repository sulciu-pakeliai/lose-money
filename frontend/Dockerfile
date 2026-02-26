FROM oven/bun:1-alpine AS base
WORKDIR /app

# --- Development Stage ---
FROM base AS dev
# Only copy dependency definitions.
# The actual source code is mounted via docker-compose volumes.
COPY package.json bun.lock ./
RUN bun install
CMD ["bun", "run", "dev"]

# --- Builder Stage ---
FROM base AS builder
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Runs your build.ts (assuming "build" script in package.json runs "bun build.ts")
RUN bun run build

# --- Production Stage ---
FROM base AS prod
COPY --from=builder /app/node_modules ./node_modules
# Copy built artifacts.
# NOTE: If your build.ts outputs to /app/dist or /app/build, copy that specific folder instead.
COPY --from=builder /app ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "start"]
