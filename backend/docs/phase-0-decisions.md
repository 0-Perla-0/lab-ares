# Phase 0 backend decisions

## Settled

- The backend is an independent NestJS application. Astro only consumes `/api`.
- MariaDB is the source of truth for domain data and persistent sessions.
- Authorization uses explicit permission plus `self`, `area`, `sede`, or
  `global` scope. Role checks must not be scattered through controllers.
- The application time zone is `America/Mexico_City`; timestamps remain UTC in
  storage and are interpreted using `APP_TIME_ZONE` at domain boundaries.
- Future check-in writes must be transactional, idempotent, use server time,
  and reject more than one open attendance interval per user.
- Document binaries will use an S3-compatible storage abstraction. MinIO is the
  preferred local implementation; MariaDB stores metadata and workflow state.
- OpenAPI 3.1 JSON at `/api/docs/openapi.json` is the backend contract.

## Deliberately deferred

- The legacy hour-validation v1/v2 choice must be confirmed before Phase 3.
  The new module will isolate the calculation behind a policy so the HTTP and
  persistence contracts do not depend on that choice.
- `Generaciones` and `Centros U.` are not added to the schema until product
  confirms that they remain active requirements.
- Geolocation, IP restrictions, check-in tolerance, and overnight-shift rules
  require explicit business acceptance before Phase 2 closes.
