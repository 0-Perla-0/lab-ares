# Phase 0 backend decisions

## Settled

- The backend is an independent NestJS application. The Next.js frontend consumes `/api` through a same-origin rewrite.
- MariaDB is the source of truth for domain data and persistent sessions.
- Authorization uses explicit permission plus `self`, `area`, `sede`, or
  `global` scope. Role checks must not be scattered through controllers.
- The application time zone is `America/Mexico_City`; timestamps remain UTC in
  storage and are interpreted using `APP_TIME_ZONE` at domain boundaries.
- Check-in writes are transactional, idempotent, use server time,
  and reject more than one open attendance interval per user.
- Incremento 1 de asistencia usa hora real del servidor; las horas cerradas
  quedan `PENDIENTE` hasta una futura validación. No se aplican GPS, IP ni
  tolerancias, y un intervalo puede cruzar medianoche.
- El cierre manual está disponible para coordinador o superior dentro de su
  alcance organizacional y exige un motivo. La operación registra actor, hora,
  motivo y huella de idempotencia.
- Document binaries will use an S3-compatible storage abstraction. MinIO is the
  preferred local implementation; MariaDB stores metadata and workflow state.
- OpenAPI 3.1 JSON at `/api/docs/openapi.json` is the backend contract.

## Deliberately deferred

- The legacy hour-validation v1/v2 choice must be confirmed before implementing validation in increment 2.
  The new module will isolate the calculation behind a policy so the HTTP and
  persistence contracts do not depend on that choice.
- `Generaciones` and `Centros U.` are not added to the schema until product
  confirms that they remain active requirements.
- Validation v1/v2, faltas, semáforo de riesgo, validación masiva, documentos
  y Kairos permanecen fuera del incremento 1 y requieren contratos propios.
- El umbral inicial configurable de alerta de 12 horas es una propuesta
  operativa, no una aceptación definitiva; no existe auto-cierre.
