# Testing

Status: Verified locally on 22 September 2026.

- Unit/E2E: 160 backend tests and 4 frontend tests pass in the reported run.
- Integration: temporary MariaDB 11.8.3 run passes 9 tests, including 7 attendance cases.
- Checks: `npm run quality` passes formatting, Prisma validation/generation, tests, types and production builds of both applications.
- Browser: real session login, own check-in/out and pending-hour totals, followed by coordinator manual closure with required reason, passed against the temporary database.
- Coverage: not used as a completion claim here.

Scripts and CI are authoritative: [package.json](../../package.json) and [CI](../../.github/workflows/ci.yml).

Run `npm run test:integration` only against a dedicated migrated database whose name ends in `_test` or `_ci`. Attendance tests create uniquely named fixtures and remove only those fixtures. They exercise concurrent starts, concurrent closures, idempotent replay, scope isolation, overnight duration, audit events and history pagination. Docker images were not built locally because the Docker engine was unavailable; CI contains those builds.
