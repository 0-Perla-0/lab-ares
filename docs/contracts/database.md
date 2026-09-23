# Database

Status: Verified for current schema.

- Engine: MariaDB/MySQL.
- Entities: organization, users, sessions, `Asistencia`, events and idempotency requests.
- Relationships: users retain attendance assignment snapshots; open sessions are unique per user.
- Migrations: [`backend/prisma/migrations/`](../../backend/prisma/migrations/), including attendance migration.
- Constraints: Prisma schema and database foreign keys are authoritative.
- Schema source: [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma).
