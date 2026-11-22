FROM node:22.14.0-alpine3.21

RUN apk add --no-cache openssl libc6-compat wget bash && npm install -g pnpm@9.15.9

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter api

COPY tsconfig.base.json ./
COPY apps/api ./apps/api
RUN pnpm --filter api exec prisma generate && pnpm --filter api exec tsc -p tsconfig.json

# Set only AFTER install/build: NODE_ENV=production makes pnpm skip devDependencies.
ENV NODE_ENV=production

RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "apps/api/dist/src/server.js"]
