# Asistencia — incremento 1

El módulo vertical está implementado en [`backend/src/attendance/`](../src/attendance/), con persistencia en [`backend/prisma/migrations/20260922223000_attendance/`](../prisma/migrations/20260922223000_attendance/). El contrato HTTP generado en `GET /api/docs/openapi.json` es la fuente de detalle.

## Alcance

- `GET /api/attendance/me`: historial propio, sesión abierta, bolsa por estado, hora del servidor, zona horaria y aviso de sesión prolongada.
- `GET /api/attendance/open`: cola de sesiones abiertas dentro del alcance del coordinador o superior.
- `POST /api/attendance/check-in`: crea una sesión con hora del servidor y conserva sede, área y turno asignados al registrarla.
- `POST /api/attendance/check-out`: cierra la sesión propia y la deja en `PENDIENTE`.
- `POST /api/attendance/:id/close`: cierre manual dentro del alcance RBAC, con motivo obligatorio.

Las escrituras exigen `Idempotency-Key`; se guarda la huella por actor y se devuelve la misma respuesta en reintentos. Los eventos conservan actor, acción, hora y motivo. No se reciben tiempos del cliente ni se aplican GPS, IP o tolerancia. Los cruces de medianoche son válidos.

## Estados y límites

`ABIERTA` representa una sesión activa; cualquier cierre pasa a `PENDIENTE`. La bolsa suma segundos de intervalos cerrados por estado. `AUTORIZADA` y `RECHAZADA` están modelados, pero no tienen endpoint de validación. El umbral inicial de alerta es configurable mediante `ATTENDANCE_ALERT_HOURS` (12 horas por defecto, también en Compose); sólo avisa de duración prolongada y no cierra automáticamente ni constituye el semáforo de riesgo de negocio.

Validación v1/v2, cálculo definitivo de horas, semáforo de negocio, operación masiva, faltas, documentos y Kairos quedan pendientes.

## Frontend y verificación

La pantalla está en [`frontend/app/portal/asistencia/`](../../frontend/app/portal/asistencia/) y [`frontend/components/portal/attendance-page.tsx`](../../frontend/components/portal/attendance-page.tsx). Incluye entrada/salida, historial, paginación independiente de cola y formulario de motivo.

Verificado el 22 de septiembre de 2026: `npm run quality` (160 pruebas backend y 4 frontend, tipos y ambos builds), 9 pruebas de integración contra MariaDB 11.8.3 temporal y recorrido real en navegador de entrada, salida y cierre manual. Pruebas: [unitarias](../test/unit/attendance/), [HTTP](../test/e2e/attendance.e2e.test.ts), [concurrencia e integración](../test/integration/attendance.integration.test.ts), [frontend](../../frontend/test/attendance.test.ts).

Para activar el módulo en otra base, genera el cliente y aplica las migraciones con `npm run prisma:generate` y `npm run prisma:migrate:deploy` antes de iniciar las aplicaciones. No se ha aplicado la migración a una base del usuario ni desplegado a producción.
