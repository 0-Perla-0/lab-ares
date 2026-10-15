# Calendario jerárquico

ID: `calendario` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Festivos, vacaciones, suspensiones, permisos, horarios especiales y asistencia extraordinaria. Decisión 5.2B.
Sin abono automático de horas ni resurrección de faltas al revocar.

## Reglas y criterios de aceptación

- **AC-1:** Precedencia usuario > área > sede > global > turno; empate por más reciente/ID. Efecto explícito decide obligación/horario.
- **AC-2:** Hoy/retroactividad requieren preview durable de 15 min del mismo actor/propuesta/impacto. Cambios concurrentes invalidan confirmación.
- **AC-3:** Afectar definitivas o apelación exige ADMIN y confirmación explícita; mutaciones idempotentes/auditadas con motivo y alcance.
- **AC-4:** Revocación lógica no resucita faltas; suspensión exime, horario especial modifica snapshot y extraordinaria impone obligación. No cambia deadlines ya notificados.

## Diseño y evidencia

- [Calendario](../../../backend/src/calendar/), [UI mensual/semanal](../../../frontend/app/portal/calendario/), [tests](../../../backend/test/integration/absences-calendar.integration.test.ts).
- `GET /api/calendar/events`; crear/revocar requiere endpoints de preview y confirmación del contrato [OpenAPI](../../../backend/src/openapi/absence-calendar.openapi.ts).
- Asistencia captura excepción; el corte técnico sigue activo en festivo. Ausencias usa días hábiles, no sólo días del turno parcial.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4:** Resolución jerárquica, previews y UI existentes.
- [ ] **T2 · validación · AC-1/2/4:** Aceptar cambios concurrentes/retroactivos y uso accesible del calendario completo.
- [ ] **T3 · externo · AC-1/4:** Cargar/aprobar calendario institucional real y motivos autorizados; no inventar festivos o permisos.
