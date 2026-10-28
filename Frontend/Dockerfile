# Multi-stage build for one of the Nx + Next.js apps (standalone output), picked by the APP build arg:
# `demo` (the site, the default) or `admin` (the back office).
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

# Declared after the install, so the two apps' builds share every layer above: one install per commit.
ARG APP=demo
# The site's /admin/* redirect (apps/demo/next.config.js) is worked out by `next build`, so the back
# office's URL has to be here at build time; setting it on the running container changes nothing.
ARG ADMIN_APP_URL
RUN case "$APP" in demo|admin) ;; *) echo "APP must be demo or admin, not '$APP'" >&2; exit 1 ;; esac
RUN pnpm exec nx build "$APP"

# ---------- runner ----------
FROM node:22-alpine AS runner
ARG APP=demo
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV APP=$APP

# Run as a non-root user.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# Standalone server + its traced node_modules (paths mirror the monorepo from the tracing root).
COPY --from=builder --chown=nextjs:nodejs /app/apps/$APP/.next/standalone ./
# Static assets + public/ are NOT included in standalone — copy them alongside.
COPY --from=builder --chown=nextjs:nodejs /app/apps/$APP/.next/static ./apps/$APP/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/$APP/public ./apps/$APP/public

USER nextjs
EXPOSE 3000
# A shell to expand $APP, then exec so node is PID 1 and gets the SIGTERM of `docker stop`.
CMD ["sh", "-c", "exec node apps/$APP/server.js"]
