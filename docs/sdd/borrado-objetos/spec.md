# Borrado externo durable

ID: `borrado-objetos` · Estado: parcial · Revisión: 2026-10-26

## Objetivo y alcance

Eliminar versiones S3 con intención durable y evidencia reconciliable. Hoy cubre CSV terminal/preparaciones con metadata, archivos rechazados autorizados y adjuntos de ausencias terminales.
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
- Propósito `ABSENCE_ATTACHMENT` (26/10): la intención queda ligada a la ausencia dueña (`resourceId`); exige ausencia terminal con apelación cerrada, sin otra ausencia/documento/Kairos/3D/biblioteca/público/hold, y archivo fuera del scanner. El texto se anonimiza sólo cuando todos los adjuntos están `VERIFIED`; un ítem puede encadenar hasta 20 jobs.
- [Adaptador](../../../backend/src/retention/operational-evidence.ts), [protocolo](../../../backend/src/storage/object-deletion.service.ts), [pruebas de intención](../../../backend/test/unit/storage/absence-attachment-deletion.test.ts) y [de supresión](../../../backend/test/unit/retention/absence-evidence-suppression.test.ts).
- Planes DELETE_FILE_OBJECT/DELETE_ORPHAN siguen fallando `OBJECT_DELETION_PROTOCOL_REQUIRED`; scanner/promoción retienen copias privadas. No reactivar DELETE antiguo.
- Limpieza de huérfanos y copias (26/10): tabla `OrphanObjectDeletion` (migración `20261026140000`) con el mismo manifiesto sellado, intención externa inmutable y lease; clave activa única por bucket+clave. `ORPHAN_OBJECT` exige que ningún archivo vigente o en proceso lo referencie, sin retención legal, antigüedad mínima (`STORAGE_ORPHAN_MIN_AGE_MS`) y prefijo no protegido; `QUARANTINE_COPY` sólo borra la copia privada de un archivo `DISPONIBLE` cuya copia servida existe. Todo se revalida bajo la barrera antes del despacho; una versión nueva o una referencia nueva aborta. Apagado por defecto (`OBJECT_CLEANUP_ENABLED=false`).
- IAM/versionado/custodia externa son requisitos operativos; `IfNoneMatch` no equivale a WORM. Recuperación inspecciona hasta 10000 intenciones; superar techo requiere procedimiento revisado.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4/5/6:** Protocolo acotado y rechazos fail-closed implementados.
- [x] **T2 · código · AC-4/5:** Adaptador de adjuntos de ausencia con holds compartidos, reserva y finalización por dominio; probado con mocks, falta integración real (T5).
- [x] **T3 · código · AC-1/2/5:** Intenciones para huérfanos y copias de cuarentena ([servicio](../../../backend/src/storage/orphan-object-deletion.service.ts), [API](../../../backend/src/retention/retention.controller.ts), panel de limpieza en la página de retención); validado en MariaDB y MinIO versionado ([integración](../../../backend/test/integration/object-cleanup.integration.test.ts)).
- [x] **T4 · código · AC-6:** Diagnóstico (`recoveryAssessment`), importación verificada de intenciones externas (UNCERTAIN, sólo lectura para demostrar ausencia) y reconocimiento de sujetos ausentes del snapshot, dentro de la corrida que posee la barrera ([importación](../../../backend/src/storage/object-deletion.service.ts)); ver [recuperación](../recuperacion/spec.md).
- [ ] **T5 · validación · AC-2/4/5:** Adjuntos, huérfanos, copias e importación probados en MariaDB y MinIO versionado del 26/10; faltan fallos parciales de red reales, capacidad, concurrencia de todos los emisores y restore conjunto.
- [ ] **T6 · externo · AC-3/4:** Aprobar tratamiento/IAM/custodia/rotación/capacidad; sin supresión productiva autorizada por esta spec.
