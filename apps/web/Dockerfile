FROM node:22.14.0-alpine3.21 AS build

RUN npm install -g pnpm@9.15.9
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter web

COPY tsconfig.base.json ./
COPY apps/web ./apps/web
RUN pnpm --filter web exec tsc -p tsconfig.json --noEmit && pnpm --filter web exec vite build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
