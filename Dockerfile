# syntax=docker/dockerfile:1

FROM oven/bun:1-slim AS builder
WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json build.ts ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY public/songs ./public/songs
COPY server.ts ./

RUN bun run build

FROM oven/bun:1-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/piano.db

COPY --from=builder /app/package.json /app/bun.lock /app/bunfig.toml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public

RUN mkdir -p /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/profile').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["bun", "server.ts"]
