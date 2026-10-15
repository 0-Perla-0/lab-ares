# Periodos operativos de servicio

ID: `periodos-servicio` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Registro operativo de inicio/fin, confirmado como alcance el 13/10/2026. No impone 480 horas, no genera asistencia ni libera legalmente.
Requiere [formalización](../expediente/spec.md).

## Reglas y criterios de aceptación

- **AC-1:** Un periodo por formalización, inicio de la constancia inmutable y fin explícito no anterior.
- **AC-2:** `REGISTRADO → INICIADO → CERRADO` o cancelación desde no terminal; terminales no reabren. Corregir mediante cancelación y nueva formalización/periodo.
- **AC-3:** Otra autoridad con alcance, `DOCUMENTS_REVIEW`, autenticación reciente, clave durable y versión observada; iniciar exige cuenta activa/academia vigente.
- **AC-4:** Historial, auditoría, aviso/outbox y recibo son atómicos. Pausar nuevo trabajo no impide cerrar/cancelar pendientes.

## Diseño y evidencia

- [Servicio](../../../backend/src/documents/service-periods.service.ts), [controlador](../../../backend/src/documents/service-periods.controller.ts), [UI de expediente](../../../frontend/app/portal/expediente/).
- `GET|POST /api/service-periods`, `POST /api/service-periods/:id/transition`.
- `EventoPeriodoServicio` es append-only con runtime `SELECT, INSERT`.
- [Integración](../../../backend/test/integration/remaining-closure.integration.test.ts), [full-stack](../../../frontend/fullstack/completion.spec.ts).

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4:** Registro, transiciones y consulta de historial implementados.
- [ ] **T2 · validación · AC-2/3/4:** Completar aceptación de cancelaciones, pausa y conflictos entre autoridades.
- [ ] **T3 · externo · AC-1:** Aceptar operación institucional de fechas/constancias sin ampliar a metas de horas o liberación legal.
