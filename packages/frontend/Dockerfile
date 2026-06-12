# =====================================================================
#  Frontend — multi-stage. Build context = repo root.
# =====================================================================
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
RUN pnpm install --no-frozen-lockfile
COPY packages/shared packages/shared
COPY packages/frontend packages/frontend

# ── dev: Vite dev server (codice bind-montato dal compose) ──
FROM base AS dev
ENV NODE_ENV=development
WORKDIR /app/packages/frontend
EXPOSE 5173
CMD ["pnpm", "dev"]

# ── build: bundle statico ──
FROM base AS build
RUN pnpm --filter @sisuite/frontend build

# ── prod: nginx statico ──
FROM nginx:alpine AS prod
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
EXPOSE 5173
