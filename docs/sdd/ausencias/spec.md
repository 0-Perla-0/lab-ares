# Ausencias, justificación y apelación

ID: `ausencias` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Falta provisional, escritos privados, aclaración y apelación ordinaria. Decisiones 5C y 5.1B.
Depende de [calendario](../calendario/spec.md) e historia de [organización](../organizacion/spec.md).

## Reglas y criterios de aceptación

- **AC-1:** Generar sólo día cerrado sin entrada, con prestador/turno/organización históricamente elegibles y sin excepción eximente; cualquier entrada excluye ausencia automática.
- **AC-2:** Inicio `PENDIENTE_JUSTIFICACION`; 5 días hábiles desde detección/aviso, 2 para aclarar y 3 para apelar rechazo/vencimiento. Deadlines persistidos, México; no recalcularlos silenciosamente.
- **AC-3:** Sólo titular escribe, incluso ADMIN. Resolución con alcance del snapshot, versión y clave; una apelación, autoridad distinta y no inferior. Vencimiento `NO_JUSTIFICADA/PLAZO_VENCIDO`.
- **AC-4:** PDF/JPG/PNG privados limpios hasta 10 MiB; URL autorizada breve, sin narrativas médicas en auditoría ni almacenamiento persistente del cliente.
- **AC-5:** Worker durable con checkpoint fecha/cursor, exclusión multirréplica y auditoría atómica. Historia desconocida/intradía genera issue, no obligación inventada.

## Diseño y evidencia

- [Ausencias](../../../backend/src/absences/), [UI](../../../frontend/app/portal/asistencia/ausencias/), [integración](../../../backend/test/integration/absences-calendar.integration.test.ts).
- `ABSENCE_WORKER_ENABLED=false`; fecha inicial explícita o ayer, sin backfill automático indiscriminado.
- Operación GLOBAL puede programar reevaluación idempotente de últimas 31 fechas cerradas; no reabre decisiones finales ni fabrica historia.
- [Retención de evidencia](../../../backend/src/retention/operational-evidence.ts) bloquea adjuntos con `OBJECT_DELETION_PROTOCOL_REQUIRED`.
- Dependencias: [borrado durable](../borrado-objetos/spec.md), [comunicaciones](../comunicaciones/spec.md).

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4/5:** API/UI, checkpoint e issues históricos implementados.
- [ ] **T2 · código · AC-4:** Adaptador por fases para supresión de adjuntos, compartidos/holds y replay redactado; no volver al DELETE directo.
- [ ] **T3 · validación · AC-1/2/5:** Aceptar calendario/deadlines, réplicas y revisión de issues sin duplicar decisiones.
- [ ] **T4 · externo · AC-1/2/5:** Aprobar calendario, cobertura histórica y arranque del worker; historia anterior no se infiere.
