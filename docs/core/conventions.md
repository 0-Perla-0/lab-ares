# Conventions

Status: Verified for current reconstruction.

- Naming/layout: domain modules under `backend/src`; App Router pages under `frontend/app`.
- Style: TypeScript formatting and linting are enforced by repository scripts.
- Errors: backend uses typed API exceptions and Zod validation pipes.
- Patterns: permissions are centralized in [`backend/src/auth/permissions.ts`](../../backend/src/auth/permissions.ts); migrations are versioned.
