# Conservación y supresión

ID: `retencion` · Estado: parcial · Revisión: 2026-10-26

## Objetivo y alcance

Matriz versionada, solicitudes, legal holds, preview/autorización/lotes y journal externo. Decisión 24B.
Enum/categoría declarada no equivale a adaptador ejecutable ni autoriza tratamiento institucional.

## Reglas y criterios de aceptación

- **AC-1:** Cada regla tiene finalidad/evento/plazos/acción/fundamento/aprobación; datos de negocio no se suprimen sin aprobación institucional explícita.
- **AC-2:** Activo → bloqueado/archivado → supresión programada → suprimido/anonimizado. Hold con motivo/responsable/revisión pausa efecto; un claim no es supresión.
- **AC-3:** Efecto revalida lote/regla/corte/hold/autoridad global y lease vigente bajo barrera/época. DB, recibo, auditoría, constancia y journal atómicos; pausa no se sobrescribe al finalizar.
- **AC-4:** Recursos vivos/compartidos/held o adaptadores inexistentes fallan cerrado. Journal append HMAC/412 compara bytes, no publica tras perder época/lease ni promete rollback de S3.
- **AC-5:** Una solicitud abre evaluación, no borrado inmediato. Restore reaplica supresiones antes de reapertura. No certificar ausencia física sin [borrado por fases](../borrado-objetos/spec.md).

## Diseño y evidencia

- [Retención](../../../backend/src/retention/), [adaptadores ejecutables](../../../backend/src/retention/retention-adapters.ts), [UI](../../../frontend/app/portal/retencion/).
- Hoy: reportes, sesiones/tokens/desafíos inutilizables, notificaciones, rechazados y evidencia DB de asistencia/visitas/ausencias; adjuntos de ausencia vía borrado durable `ABSENCE_ATTACHMENT` (sin integración real aún); copias y huérfanos siguen bloqueados.
- Identidad, academia, expediente, Kairos, biblioteca, auditoría y logs no tienen tratamientos universales. `TechnicalLog` no se admite como adaptador ficticio.
- [Carreras reales](../../../backend/test/integration/retention-worker-safety.integration.test.ts), [journal](../../../backend/src/recovery/suppression-journal.worker.ts).
- `RETENTION_WORKER_ENABLED=false`; políticas institucionales exigen aprobación separada. Registrar población elegible sigue siendo operación gobernada, no barrido automático completo.
- Provisionales históricos permitidos (24B): exportaciones 24 h, sesiones cerradas/logs ordinarios 90 días, tokens inutilizados al vencer. Son límites aprobados, no garantía de adaptador/registro automático implementado.
- Retirada inmediata de binarios peligrosos es objetivo pendiente del protocolo seguro; hoy se conservan privados, no se afirma su eliminación.

## Tareas y pendientes

- [x] **T1 · código · AC-2/3/4/5:** Matriz/lotes/holds, barrera/época y journal implementados para recursos cubiertos.
- [ ] **T2 · código · AC-1/2/4:** Lifecycle/registro gobernado y adaptadores reales para categorías restantes, una vez definido el tratamiento.
- [x] **T3 · código · AC-4/5:** Adjuntos de ausencia, huérfanos y copias de cuarentena adaptados al borrado durable ([borrado](../borrado-objetos/spec.md)); ningún DELETE corre dentro de un rollback SQL.
- [ ] **T4 · validación · AC-3/4/5:** Matriz completa de carreras/dependencias compartidas/leases y restore con journal.
- [ ] **T5 · externo · AC-1:** Aprobar plazos/tratamientos institucionales y holds; no usar defaults inventados ni activar supresión real.
