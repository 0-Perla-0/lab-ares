# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace @ares/backend --include-workspace-root

FROM dependencies AS build
COPY backend backend
# Prisma loads prisma.config.ts during generation, but this step does not
# connect to the database. Keep the real DATABASE_URL out of the image build.
RUN DATABASE_URL=mysql://prisma_generate@127.0.0.1:3306/ares_build \
    npm run prisma:generate --workspace @ares/backend \
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
