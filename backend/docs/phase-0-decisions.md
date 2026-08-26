# Phase 0 backend decisions

## Settled

- The backend is an independent NestJS application. The Next.js frontend consumes `/api` through a same-origin rewrite.
- MariaDB is the source of truth for domain data and persistent sessions.
- Authorization uses explicit permission plus `self`, `area`, `sede`, or
  `global` scope. Role checks must not be scattered through controllers.
- The application time zone is `America/Mexico_City`; timestamps remain UTC in
  storage and are interpreted using `APP_TIME_ZONE` at domain boundaries.
- Future check-in writes must be transactional, idempotent, use server time,
  and reject more than one open attendance interval per user.
- Attendance risk is advisory and versioned. Duration thresholds are red below
  5 minutes, yellow from 5 through 29, green from 30 through 480, yellow above
  480 through 600, and red above 600 minutes. Schedule, location and network
  signals add explainable reasons but never approve or reject automatically.
- Location is consented and optional. Location or network failures never block
  check-in/out. The server stores its observed IP, never one supplied by the
  client, and the ordinary self response exposes only evidence-presence flags.
- The first attendance version does not support overnight shifts. An open
  interval is cut after 23:59 in `America/Mexico_City` as `CHECKOUT_OMITIDO`
  and requires review before its hours can count.
- Document binaries will use an S3-compatible storage abstraction. MinIO is the
  preferred local implementation; MariaDB stores metadata and workflow state.
- OpenAPI 3.1 JSON at `/api/docs/openapi.json` is the backend contract.

## Deliberately deferred

- `Generaciones` and `Centros U.` are not added to the schema until product
  confirms that they remain active requirements.
- Per-site geofences and recognized-network values are deferred until the
  versioned site-policy administration endpoint is implemented. Capturing
  optional evidence and the non-blocking behavior are already settled.
