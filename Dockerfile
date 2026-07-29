# syntax=docker/dockerfile:1

###############################################################################
# deps — install once, cached on the lockfile alone
###############################################################################
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

###############################################################################
# builder — compile the Next standalone bundle
###############################################################################
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Build-time DATABASE_URL is a placeholder: every DB-touching route is dynamic
# or revalidated, so nothing connects during `next build`.
ENV DATABASE_URL="postgres://build:build@localhost:5432/build"
RUN npm run build

###############################################################################
# runner — minimal runtime, non-root
###############################################################################
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# `standalone` ships its own minimal node_modules; static/ must be placed by hand.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migrations + the runner they need. drizzle-kit is not required at runtime,
# only the generated SQL and drizzle-orm's migrator.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/src/db ./src/db
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres
COPY --chown=nextjs:nodejs docker/entrypoint.sh ./entrypoint.sh
# entrypoint.sh invokes ./docker/migrate.mjs, so it has to keep that path.
COPY --chown=nextjs:nodejs docker/migrate.mjs ./docker/migrate.mjs
RUN chmod +x ./entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]
