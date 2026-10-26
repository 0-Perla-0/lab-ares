# Recuperación coordinada

ID: `recuperacion` · Estado: parcial · Revisión: 2026-10-26

## Objetivo y alcance

Plano de control, barrera durable, preview/reconciliación, auditoría, journal y aprobación independiente. Decisión 29B.
API no ejecuta PITR/restore destructivo del proveedor; UI sólo prepara/consulta/preview, no autoriza reapertura.

## Reglas y criterios de aceptación

- **AC-1:** Secuencia plan → freeze → registro restore externo → preview → reconciliación → auditoría → importar journal → reaplicar → aprobación independiente → unfreeze → complete.
- **AC-2:** Barrera ausente/activa falla cerrado para mutaciones ordinarias; excepciones exactas del plano de control. FAILED/CANCELLED no liberan silenciosamente una barrera activa.
- **AC-3:** Verificar hash de preview, propietario/época y evidencia antes de efectos. No reapertura con intenciones externas pendientes/huérfanas o firma/namespace/evidencia inválidos.
- **AC-4:** Restore aislado debe conciliar DB+objetos+journal+auditoría y medir punto/tiempo reales; no basta un dump SQL ni restaurar sólo metadatos.
- **AC-5:** Objetivos internos: crítico RPO 15 min/RTO 240 min; importante 60/480; secundario 1440/480 (día hábil técnico). No son mediciones ni garantía contractual.

## Diseño y evidencia

- [Recuperación](../../../backend/src/recovery/), [UI](../../../frontend/app/portal/admin/recuperacion/), [tests](../../../backend/test/unit/recovery/).
- Históricamente hubo ensayo SQL aislado; no acredita restore conjunto/PITR ni el último incremento. [Memoria](../../../MEMORY.md).
- [Reconciliador storage](../../../backend/src/storage/storage.reconciler.ts) rechaza planes con DELETE antes de aplicar; no eliminar bloqueo sin protocolo.
- [Borrado durable](../borrado-objetos/spec.md) detecta intenciones externas ausentes del snapshot. Desde el 26/10 `recoveryAssessment` las clasifica sin escribir (`NOT_IN_SQL`, `BODY_MISMATCH`, `TOO_LARGE`, `VERSIONS_REMAINING`, `MISSING_EXTERNAL_PROOF`) y la aprobación de readiness devuelve sólo los conteos por motivo, sin referencias.
- Decisión (26/10) para la importación: una intención huérfana se importaría como job `UNCERTAIN` verificado contra su HMAC y reconciliado en sólo lectura antes de completar, dentro de la corrida de recuperación y con autoridad de restore. No se implementa sin ensayo aislado (T3) ni T4: importar es una escritura que decide qué historia se acepta.
- Estrategia aprobada: PITR para RPO crítico, backup diario con retención inicial 30 días, objetos redundantes/versionados; ensayo antes de piloto y trimestral durante operación.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/5:** Control/barrera/journal/objetivos implementados con bloqueos conservadores.
- [ ] **T2 · código · AC-3/4:** Diagnóstico de intenciones huérfanas hecho ([servicio](../../../backend/src/storage/object-deletion.service.ts), [pruebas](../../../backend/test/unit/storage/deletion-integrity.test.ts)); falta la importación/reconciliación y snapshots anteriores.
- [ ] **T3 · validación · AC-2/3/4/5:** Ensayo coordinado nuevo DB+objetos+journal con freezes/leases/holds, fallos parciales y RPO/RTO medidos.
- [ ] **T4 · externo · AC-4/5:** Proveedor, binlogs/PITR, backups/custodia, autoridad de restore/unfreeze y revisión institucional explícita.
