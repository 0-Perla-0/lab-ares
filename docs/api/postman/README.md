# Ares Backend 2 — Postman

Import `ares-backend2.postman_collection.json` and `ares-local.postman_environment.json`. The collection relies on Postman's cookie jar for the `ares-session` cookie; do not copy that cookie into request bodies or source control.

Recovery and invitation tokens are intentionally manual variables because they are delivered by email. With local SMTP enabled, inspect Mailpit at http://localhost:8025, copy the token into `recoveryToken` or `invitationToken`, then run the corresponding request. MFA setup secrets and recovery codes are similarly transient and must never be committed.

Requests include negative paths through validation values and unauthorized calls. Replace `password`, `newPassword`, and identity IDs with local test data. Responses use the API's `{ data: ... }` envelope.

The `Gamification - ledger privado` folder requires `GAMIFICATION_ENABLED=true`
and a restart of the backend; the default is `false`. Set
`gamificationUserId` to an active user. Administrative catalog changes,
recognitions and reversals require an `ADMIN` session. The collection generates
an `Idempotency-Key` for manual grants and reversals and verifies that profiles
remain private and contain no ranking.
