# Multi-stage build for the Nx + Next.js `demo` app (standalone output).
# Build context = Frontend/ (the pnpm monorepo root).

# ---------- builder ----------
FROM node:22-alpine AS builder
# libc6-compat: musl shim some native prebuilds (swc) expect.
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Copy the whole monorepo (workspace package.jsons + lockfile + sources).
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm exec nx build demo

# ---------- runner ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# Standalone server + its traced node_modules (paths mirror the monorepo from the tracing root).
COPY --from=builder --chown=nextjs:nodejs /app/apps/demo/.next/standalone ./
# Static assets + public/ are NOT included in standalone — copy them alongside.
COPY --from=builder --chown=nextjs:nodejs /app/apps/demo/.next/static ./apps/demo/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/demo/public ./apps/demo/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/demo/server.js"]
