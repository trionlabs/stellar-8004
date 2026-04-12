FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/indexer/package.json packages/indexer/
COPY packages/sdk/package.json packages/sdk/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @trionlabs/8004-sdk build
RUN pnpm --filter @stellar8004/web build
# Deploy creates a flat, self-contained node_modules without symlinks
RUN pnpm --filter @stellar8004/web deploy --legacy --prod /prod

FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=build /app/apps/web/build ./build
COPY --from=build /prod/package.json ./
COPY --from=build /prod/node_modules ./node_modules
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/* && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
USER nodejs
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1
CMD ["node", "build"]
