# Security

Status: Verified for current scope.

- Trust boundaries: browser/client to same-origin Next.js proxy to NestJS backend and MariaDB.
- Secret handling: environment variables; production rejects insecure session defaults.
- Authentication: HTTP-only persisted sessions, login rate limiting and bcrypt password hashes.
- Authorization: centralized permissions with self/area/sede/global scopes enforced server-side.
- Sensitive data: sessions, password hashes and attendance audit records stay server-side.
- Known risks: legacy documents contain exposed credentials; they must not be reused.

Sources: [`backend/src/auth/`](../../backend/src/auth/), [`backend/src/config/`](../../backend/src/config/), [README.md](../../README.md).

Never store actual secrets in documentation.
