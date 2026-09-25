# Setup

Status: Verified from repository instructions.

- Prerequisites: Node.js 24.19.0, npm 11.17.0 and MariaDB/MySQL.
- Install: `npm ci`, then `npm run prisma:generate` and `npm run prisma:migrate`.
- Configuration: copy `.env.example`; provide database URL and a real session secret.
- Start: `npm run dev:backend` and `npm run dev:frontend` from the repository root.

Details: [README.md](../../README.md).
