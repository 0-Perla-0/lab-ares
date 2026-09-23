# Architecture

Status: Verified for current reconstruction.

- Boundaries: `frontend/` UI and `backend/` HTTP/domain/persistence.
- Layers: controllers, policies/services, Prisma persistence.
- Components: auth, organization, users and attendance modules.
- Dependencies: frontend same-origin `/api`; backend MariaDB via Prisma.
- Data flow: HTTP session -> permission guard -> service transaction -> DB.
- Structural decisions: independent NestJS backend; see [`backend/docs/phase-0-decisions.md`](../../backend/docs/phase-0-decisions.md).
