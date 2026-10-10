# SegueIT Projects — container images for the API and the web app.
#
# Easiest:   docker compose up --build        (see docker-compose.yml)
# By hand:   docker build --target api -t segueit-api .
#            docker build --target web -t segueit-web .
#
# NEXT_PUBLIC_* values and API_PROXY_TARGET are baked into the web image at build time,
# so pass them as --build-arg (compose does this for you).

ARG NODE_IMAGE=node:22-alpine

# ─── API ──────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS api-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# The API postinstall runs `prisma generate`, which needs the schema.
COPY apps/api/prisma apps/api/prisma
RUN npm ci -w @segueit/api --no-audit --no-fund
COPY apps/api apps/api
RUN npm run build -w @segueit/api

FROM ${NODE_IMAGE} AS api
WORKDIR /app
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    APP_NAME="SegueIT Projects" \
    PORT=4000 \
    API_PREFIX=api \
    CORS_ORIGINS="" \
    SWAGGER_ENABLED=false \
    JWT_ACCESS_EXPIRES_IN=15m \
    JWT_REFRESH_EXPIRES_IN=7d \
    JWT_REFRESH_REMEMBER_EXPIRES_IN=30d \
    BCRYPT_SALT_ROUNDS=12 \
    ACCESS_COOKIE_NAME=sptms_at \
    REFRESH_COOKIE_NAME=sptms_rt \
    ROOT_WORKSPACE_COOKIE_NAME=sptms_ws \
    COOKIE_SECURE=false \
    COOKIE_SAME_SITE=lax \
    THROTTLE_TTL_MS=60000 \
    THROTTLE_LIMIT=300 \
    AUTH_THROTTLE_LIMIT=20 \
    DEFAULT_PAGE_SIZE=20 \
    MAX_PAGE_SIZE=200 \
    MEETING_DIGEST_HOUR=8 \
    SEED_ON_START=true \
    SEED_DEMO_DATA=false
# The seed creates the root account (accounts are defined in prisma/seed-data.ts).
# Prisma CLI and tsx stay installed: the entrypoint syncs the schema and runs the seed.
COPY --from=api-build /app/package.json ./
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api ./apps/api
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh && mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/'+process.env.API_PREFIX+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["api-entrypoint.sh"]

# ─── Web ──────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @segueit/web --no-audit --no-fund
COPY apps/web apps/web
ARG NEXT_PUBLIC_APP_NAME="SegueIT Projects"
ARG NEXT_PUBLIC_APP_SHORT_NAME="SegueIT"
ARG NEXT_PUBLIC_APP_TAGLINE="Plan, track and deliver every project with confidence."
ARG NEXT_PUBLIC_COMPANY_NAME="SegueIT"
ARG NEXT_PUBLIC_BRAND_COLOR="#0b5cad"
ARG NEXT_PUBLIC_API_BASE_PATH=/api
ARG NEXT_PUBLIC_DEFAULT_PAGE_SIZE=20
ARG NEXT_PUBLIC_BOARD_PAGE_SIZE=200
ARG NEXT_PUBLIC_NOTIFICATION_POLL_MS=30000
ARG NEXT_PUBLIC_DATE_FORMAT="dd MMM yyyy"
# Where the web server forwards /api requests (the compose service name by default).
ARG API_PROXY_TARGET=http://api:4000/api
ARG AUTH_REFRESH_COOKIE_NAME=sptms_rt
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME} \
    NEXT_PUBLIC_APP_SHORT_NAME=${NEXT_PUBLIC_APP_SHORT_NAME} \
    NEXT_PUBLIC_APP_TAGLINE=${NEXT_PUBLIC_APP_TAGLINE} \
    NEXT_PUBLIC_COMPANY_NAME=${NEXT_PUBLIC_COMPANY_NAME} \
    NEXT_PUBLIC_BRAND_COLOR=${NEXT_PUBLIC_BRAND_COLOR} \
    NEXT_PUBLIC_API_BASE_PATH=${NEXT_PUBLIC_API_BASE_PATH} \
    NEXT_PUBLIC_DEFAULT_PAGE_SIZE=${NEXT_PUBLIC_DEFAULT_PAGE_SIZE} \
    NEXT_PUBLIC_BOARD_PAGE_SIZE=${NEXT_PUBLIC_BOARD_PAGE_SIZE} \
    NEXT_PUBLIC_NOTIFICATION_POLL_MS=${NEXT_PUBLIC_NOTIFICATION_POLL_MS} \
    NEXT_PUBLIC_DATE_FORMAT=${NEXT_PUBLIC_DATE_FORMAT} \
    API_PROXY_TARGET=${API_PROXY_TARGET} \
    AUTH_REFRESH_COOKIE_NAME=${AUTH_REFRESH_COOKIE_NAME} \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @segueit/web

FROM ${NODE_IMAGE} AS web
WORKDIR /app
ARG AUTH_REFRESH_COOKIE_NAME=sptms_rt
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    AUTH_REFRESH_COOKIE_NAME=${AUTH_REFRESH_COOKIE_NAME}
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/login').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
