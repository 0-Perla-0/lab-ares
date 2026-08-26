# Attendance backend contract

This document translates decisions 2A, 2.1B, 3B, 3.1C, 4B and 17B into the
backend contract. OpenAPI remains the authority for endpoints already exposed;
the correction, validation and daily-cut sections below define the next slices
and are not yet published as available operations.

## Implemented vertical slice

| Operation                        | Permission             | Behavior                                                                 |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| `POST /api/attendance/check-in`  | `attendance:check-in`  | Opens one self session using server time and a required idempotency key. |
| `POST /api/attendance/check-out` | `attendance:check-out` | Closes the self session and evaluates duration risk.                     |
| `GET /api/attendance/me/current` | `attendance:read`      | Returns the self open session or `null`.                                 |
| `GET /api/attendance/me`         | `attendance:read`      | Returns the latest 50 self sessions, newest first.                       |

`Idempotency-Key` is 16-128 characters. Replaying the same command and body
returns the same attendance resource without writing again; its representation
can reflect a later transition, but its ID and original server timestamps do not
change. Reusing the key for the same command with another body returns
`IDEMPOTENCY_KEY_REUSED`. Check-in/out never accepts a client timestamp;
location is optional and the IP is observed by the server.

The ordinary response never contains raw coordinates or IP addresses. It only
reports whether each kind of evidence was registered.

## Attendance state transitions

| From               | Command/job           | To                 | Conditions and effects                                              |
| ------------------ | --------------------- | ------------------ | ------------------------------------------------------------------- |
| No open session    | Check-in              | `ABIERTA`          | Server time; one open slot per user; audit in the same transaction. |
| `ABIERTA`          | Check-out             | `CERRADA`          | Server time; duration/risk calculated; hours remain pending.        |
| `ABIERTA`          | Daily cut after 23:59 | `CHECKOUT_OMITIDO` | Future job; red risk and `REQUIERE_REVISION`; contributes no hours. |
| `CHECKOUT_OMITIDO` | Authorized correction | `CERRADA`          | Future endpoint; reason required; the corrector is recorded.        |
| `CERRADA`          | Authorized correction | `CERRADA`          | Future endpoint; immutable audit and risk recalculation.            |

The user never edits their own timestamps. The daily cut, correction and
hierarchical review operations are the next implementation slice.

## Risk policy v1

Policy identifier: `attendance-risk-2026-08-25-v1`.

| Condition                | Risk   | Reason code                 |
| ------------------------ | ------ | --------------------------- |
| Duration below 5 minutes | Red    | `DURACION_MENOR_5_MIN`      |
| Duration 5-29 minutes    | Yellow | `DURACION_ENTRE_5_Y_29_MIN` |
| Duration 30-480 minutes  | Green  | None                        |
| Duration 481-600 minutes | Yellow | `DURACION_MAYOR_8_H`        |
| Duration above 600       | Red    | `DURACION_MAYOR_10_H`       |
| Check-in outside shift   | Yellow | `FUERA_DE_TURNO`            |
| Shift cannot be checked  | Yellow | `TURNO_NO_VERIFICADO`       |

The highest detected risk wins and every reason is preserved. Risk is
consultative: it never authorizes or rejects hours by itself. Location/network
reason codes will be added with the versioned site policy; missing or denied
location will remain non-blocking.

## Validation transitions for the next slice

| From                | Action                   | To           | Rule                                                        |
| ------------------- | ------------------------ | ------------ | ----------------------------------------------------------- |
| `PENDIENTE`         | Individual authorization | `AUTORIZADA` | Validator has scope and is neither user nor last corrector. |
| `PENDIENTE`         | Individual rejection     | `RECHAZADA`  | Comment required.                                           |
| `REQUIERE_REVISION` | Correction/resolution    | `PENDIENTE`  | Recalculate risk and preserve prior events.                 |
| Green `PENDIENTE`   | Bulk authorization       | `AUTORIZADA` | Maximum 100; recheck state, risk and policy version.        |

There is no bulk rejection or correction. Yellow and red sessions always need
individual action. A future correction command will require a non-empty reason
and expected record version; validation commands will create immutable decision
records rather than overwrite history.

## Stable errors

| Code                      | HTTP | Meaning                                              |
| ------------------------- | ---- | ---------------------------------------------------- |
| `VALIDATION_ERROR`        | 400  | Invalid body or missing/invalid idempotency key.     |
| `ATTENDANCE_ALREADY_OPEN` | 409  | Another open session already exists for the user.    |
| `ATTENDANCE_NOT_OPEN`     | 409  | Check-out has no open session to close.              |
| `IDEMPOTENCY_KEY_REUSED`  | 409  | The key already represents a different request body. |

## Persistence guarantees

- MariaDB enforces one open slot with a unique `(usuarioId, openSlot)` index;
  closed rows set `openSlot` to `NULL`.
- Check-in/out, its idempotency record and its audit event share one transaction.
- Scope IDs are historical snapshots and do not grant access.
- Risk version and reason codes remain stored so later configuration changes do
  not make a historical result inexplicable.

## Retention classification

| Model                            | Category                         | Start event              | Current behavior                                  |
| -------------------------------- | -------------------------------- | ------------------------ | ------------------------------------------------- |
| `Asistencia`                     | Critical operational/person data | Check-in                 | No automatic deletion until institutional policy. |
| `OperacionIdempotenteAsistencia` | Technical operation metadata     | Command confirmation     | Retained with the attendance during this phase.   |
| `EventoAuditoria`                | Critical audit/security record   | Sensitive action outcome | Append-only; never deleted by domain operations.  |

Future retention jobs must honor legal holds and the institutional matrix. No
automatic deletion is enabled by this slice, and restoring a backup must keep
attendance, operation and audit references consistent.
