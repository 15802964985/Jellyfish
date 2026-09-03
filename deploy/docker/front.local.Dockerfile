FROM m.daocloud.io/docker.io/library/node:20-alpine AS build

WORKDIR /app

RUN corepack enable
RUN corepack prepare pnpm@9.15.9 --activate

COPY front/package.json front/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY front/ ./
RUN pnpm run build

FROM m.daocloud.io/docker.io/library/nginx:1.27-alpine AS runtime

COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker/docker-entrypoint.d/10-generate-env-js.sh /docker-entrypoint.d/10-generate-env-js.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/10-generate-env-js.sh \
  && chmod +x /docker-entrypoint.d/10-generate-env-js.sh

WORKDIR /usr/share/nginx/html
COPY --from=build /app/dist/ ./

RUN printf 'window.__ENV = window.__ENV || {};\\n' > /usr/share/nginx/html/env.js

EXPOSE 80
