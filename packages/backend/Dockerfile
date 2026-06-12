# =====================================================================
#  Backend (e servizio migrate) — multi-stage. Build context = repo root.
# =====================================================================
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app
# manifesti workspace (cache install)
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
RUN pnpm install --no-frozen-lockfile
# sorgenti
COPY packages/shared packages/shared
COPY packages/backend packages/backend
COPY db db

# ── dev: hot reload (il codice è bind-montato dal compose) ──
FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3010
CMD ["pnpm", "--filter", "@sisuite/backend", "dev"]

# ── prod: gira via tsx (niente step di compilazione: TS eseguito direttamente) ──
FROM base AS prod
ENV NODE_ENV=production
EXPOSE 3010
CMD ["pnpm", "--filter", "@sisuite/backend", "start"]
