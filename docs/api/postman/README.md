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

The `Printing 3D - trabajos y ejecuciones` folder requires
`PRINTING_3D_ENABLED=true` and a backend restart; the default is `false`.
Upload an STL as the requester, wait until quarantine/scanning promotes it to
`DISPONIBLE`, set `printingFileId` and `printingOperatorId`, and let the tests
capture `printingJobId` and `printingExecutionId`. Switch sessions between the
requester and the scoped operator/manager as each request describes. Mutations
generate independent idempotency keys. Run only one finish variant per
execution: the failed variant enables retry. The API intentionally excludes
slicing, printer control, quoting, payment and 3MF.

## Retention and suppression

The `18 - Retención y supresión privada` folder documents the retention and
suppression flow. Administrative operations
require an `ADMIN` session; `/retention/requests/me` only exposes the signed-in
user's requests. Set `retentionSyntheticResourceId` to an existing disposable
test resource and `retentionSubjectId` to a test account. Never register
business resources. Responses capture `retentionRuleId`, `retentionRecordId`,
`retentionHoldId`, `retentionRequestId` and `retentionBatchId`. Use a separate
authorized batch for pause and set its identifier in `retentionPauseBatchId`.
The legal-hold request computes `reviewAt` at +7 days and `endsAt` at +14 days.

Every mutation uses a distinct `Idempotency-Key`. Provisional policies are
temporary; institutional approval is gated by
`RETENTION_INSTITUTIONAL_POLICIES_APPROVED=true`. Background polling defaults
to `RETENTION_WORKER_ENABLED=false`; the explicit execute request still
processes the selected batch synchronously. Preview only snapshots eligible
records; authorization and execution are separate operations. Execution can delete or
anonymize registered resources, so use synthetic data only. `Reintentar o
reanudar lote` accepts only `PAUSADO` or `FALLIDO` batches, resets failed items
and resumes processing. Its idempotent receipt includes `resetFailures`; read
the batch detail for final outcomes. The registry returns fingerprints rather
than business identifiers.
