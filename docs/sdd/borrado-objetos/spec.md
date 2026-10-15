# Borrado externo durable

ID: `borrado-objetos` · Estado: parcial · Revisión: 2026-10-15

## Objetivo y alcance

Eliminar versiones S3 con intención durable y evidencia reconciliable. Hoy cubre CSV terminal/preparaciones con metadata y archivos rechazados autorizados.
**MariaDB y S3 no comparten rollback.** Sin garantía de exactamente un DELETE, revocación inmediata de URLs, eliminación de backups o cumplimiento legal automático.

## Reglas y criterios de aceptación

- **AC-1:** Reservar `Archivo` como `ELIMINACION_PENDIENTE`; `ObjectDeletionJob` conserva identidad/manifiesto inmutables y lease. Estado `PREPARED → DISPATCHED → VERIFIED → COMPLETE`; incertidumbre `UNCERTAIN`.
- **AC-2:** Versionado privado Enabled, inventario completo hasta 1000 versiones por clave; historia null/truncada/desconocida falla cerrado. DELETE sólo con `VersionId` sellado.
- **AC-3:** Manifiesto HMAC con huella/namespace físico/versiones, publicado inmutable antes de despacho. Lectura/manifiesto ≤1 MiB; 412 exige bytes idénticos. Keyring histórico explícito, no redirección por configuración nueva.
- **AC-4:** `DISPATCHED` confirmado SQL es punto irreversible conservador. Hold previo gana; posterior se rechaza. Revalidar autoridad/regla/corte/época/lease antes de cada efecto; timeout/freeze posterior no deshace S3.
- **AC-5:** Sólo ausencia verificada de versiones permite certificar. Efecto DB, constancia/auditoría/journal y COMPLETE son atómicos. Asociaciones concurrentes respetan reserva bajo lock.
- **AC-6:** Reconcile GLOBAL sólo reinspecciona S3, nunca DELETE ni cierre automático del dominio. `UNCONFIRMED` no es éxito. Recuperación bloquea reapertura ante intenciones/evidencia incompletas.

## Diseño y evidencia

- [Servicio](../../../backend/src/storage/object-deletion.service.ts), [S3](../../../backend/src/storage/s3.storage.ts), [keyring](../../../backend/src/storage/deletion-keyring.ts).
- [Integración](../../../backend/test/integration/object-deletion.integration.test.ts), [invariantes](../../../backend/test/unit/storage/deletion-integrity.test.ts), [migración](../../../backend/prisma/migrations/20261013160000_durable_object_deletion/).
- API: `GET /api/retention/object-deletions`, `POST /api/retention/object-deletions/:id/reconcile`; permiso global de retención y clave durable.
- Adjuntos de ausencia y planes DELETE_FILE_OBJECT/DELETE_ORPHAN fallan `OBJECT_DELETION_PROTOCOL_REQUIRED`; scanner/promoción retienen copias privadas. No reactivar DELETE antiguo.
- IAM/versionado/custodia externa son requisitos operativos; `IfNoneMatch` no equivale a WORM. Recuperación inspecciona hasta 10000 intenciones; superar techo requiere procedimiento revisado.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4/5/6:** Protocolo acotado y rechazos fail-closed implementados.
- [ ] **T2 · código · AC-4/5:** Adaptador de adjuntos institucionales con holds compartidos, reserva y finalización por dominio.
- [ ] **T3 · código · AC-1/2/5:** Intenciones para copias/huérfanos, incluidas preparaciones sin metadata tras respuesta SQL perdida.
- [ ] **T4 · código · AC-6:** Importación/reconciliación de intenciones externas huérfanas tras restaurar snapshot anterior; ver [recuperación](../recuperacion/spec.md).
- [ ] **T5 · validación · AC-2/4/5:** Fallos parciales, capacidad, concurrencia de todos los emisores y restore conjunto en buckets sintéticos nuevos.
- [ ] **T6 · externo · AC-3/4:** Aprobar tratamiento/IAM/custodia/rotación/capacidad; sin supresión productiva autorizada por esta spec.
