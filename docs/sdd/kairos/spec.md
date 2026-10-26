# Proyectos y actividades Kairos

ID: `kairos` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Proyectos, membresía, actividades, evidencias, comentarios, historial y Kanban como proyección. Decisiones 7B, 7.1B y 7.2B.
Completar actividades no agrega horas de Servicio Social. Sin automatizaciones avanzadas implícitas.

## Reglas y criterios de aceptación

- **AC-1:** Un propietario, sublíderes, colaboradores y observadores. Roles de proyecto no sustituyen RBAC; prestadores no crean proyectos, pero miembros autorizados pueden acceder.
- **AC-2:** Actividades: pendiente, en progreso, bloqueada, en revisión, requiere corrección, terminada o cancelada; revisión por otra persona autorizada. Reapertura exige motivo.
- **AC-3:** Evidencias/versiones inmutables, autoría e historial conservados al quitar miembros; Kanban invoca transiciones válidas, no saltos arbitrarios.
- **AC-4:** Mutaciones HTTP de proyectos/miembros/actividades son idempotentes con auditoría/barrera y pertenencia vigente al replay; pausa de nuevo trabajo no impide cierre autorizado.

## Diseño y evidencia

- [Kairos](../../../backend/src/kairos/), [UI](../../../frontend/app/portal/kairos/), [pruebas](../../../backend/test/kairos.activities.service.spec.ts), [Kanban](../../../backend/test/kairos.kanban.service.spec.ts).
- Snapshot sede/área al crear actividad; reportes no reconstruyen estados pasados. Dependencias: [archivos](../archivos/spec.md), [reportes](../reportes/spec.md), [gamificación](../gamificacion/spec.md).
- [Recorridos deterministas](../../../frontend/e2e/kairos-reports.spec.ts) interceptan API; no certifican aceptación real de todos los roles/archivos.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4:** Proyecto a evidencia/revisión/Kanban integrados; no reimplementar.
- [ ] **T2 · validación · AC-1/2/4:** Recorrido full-stack por rol, revocación/traslado, pausa y respuesta perdida.
- [ ] **T3 · externo · AC-3:** Aprobar el tratamiento de las evidencias de Kairos. No hay código pendiente que inventar: al aprobarse el tratamiento se añade un adaptador por categoría con el patrón de [evidencia operativa](../../../backend/src/retention/operational-evidence.ts) y [retención](../retencion/spec.md), activable sólo con la aprobación institucional.
