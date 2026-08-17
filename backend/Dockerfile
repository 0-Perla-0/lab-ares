# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace @ares/backend --include-workspace-root

FROM dependencies AS build
COPY backend backend
RUN npm run prisma:generate --workspace @ares/backend \
    && npm run build --workspace @ares/backend

FROM build AS migrate
CMD ["npm", "run", "prisma:migrate:deploy", "--workspace", "@ares/backend"]

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace @ares/backend --include-workspace-root \
    && npm cache clean --force

COPY --from=build /app/backend/dist backend/dist

USER node
EXPOSE 3000
CMD ["node", "backend/dist/main.js"]
