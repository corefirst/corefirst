# CoreFirst — multi-stage Next.js build with standalone output.
# Final image: ~180 MB on alpine/node:20.

# ---------------------------------------------------------------------------
# Stage 1: dependencies
# Cached separately so changes to source don't re-trigger a full pnpm install.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false


# ---------------------------------------------------------------------------
# Stage 2: build
# `next build` with `output: standalone` (see next.config.js) emits a
# self-contained server bundle under .next/standalone/.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_TELEMETRY_DISABLED=1 keeps build logs clean in CI.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build


# ---------------------------------------------------------------------------
# Stage 3: runtime
# Only what's needed to run the standalone server.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as non-root for defense in depth.
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nextjs

# Standalone bundle: server.js + minimal node_modules + all traced files
# (including the prompt .md files declared in next.config.js).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets (Next chunks, fonts) — referenced by /_next/static/*
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# /public — favicon, logos, etc.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Belt-and-suspenders: also copy prompt files outside .next/standalone so the
# runtime path `process.cwd()/src/core/system_prompt.md` resolves even if
# Next's file tracer ever changes location.
COPY --from=builder --chown=nextjs:nodejs /app/src/core/system_prompt.md ./src/core/system_prompt.md
COPY --from=builder --chown=nextjs:nodejs /app/src/generator/courseware_prompt.md ./src/generator/courseware_prompt.md

# data/ holds .corefirst packages and .cfrecord progress files. Mount a host
# volume here in compose / docker run to persist learner data across restarts.
RUN mkdir -p /app/data/packages /app/data/records && chown -R nextjs:nodejs /app/data
VOLUME ["/app/data"]

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
