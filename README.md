# Ares

## Requirements

- Node.js v24.19.0
- npm 11.17.0

## Setup

npm ci
cp .env.example .env
npm run dev

## Quality checks

### Prisma

npx prisma validate
npx prisma generate

### General check

npm test
npm run format
npm run check
npm run build

## Branch strategy

main
develop
feature/*
release/*
hotfix/*
