# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace @ares/frontend --include-workspace-root

FROM dependencies AS build
ARG API_PROXY_TARGET=http://backend:3000
ENV API_PROXY_TARGET=$API_PROXY_TARGET
COPY frontend frontend
RUN npm run build --workspace @ares/frontend

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=4321
WORKDIR /app

COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static frontend/.next/static

USER node
EXPOSE 4321
WORKDIR /app/frontend
CMD ["node", "server.js"]
