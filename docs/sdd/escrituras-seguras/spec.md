# Escrituras e intenciones seguras

ID: `escrituras-seguras` · Estado: parcial · Revisión: 2026-10-26

## Objetivo y alcance

Contrato transversal por mutación: autorización vigente, barrera, idempotencia, auditoría y respuesta incierta recuperable.
No asumir cobertura universal porque existe un guard global o `DomainTransaction`.

## Reglas y criterios de aceptación

- **AC-1:** Clave durable por intención/cuerpo canónico; efecto, auditoría y recibo atómicos. Cuerpo distinto con misma clave es conflicto.
- **AC-2:** Revalidar cuenta/rol/alcance bajo lock también al replay/colisión; barrera y época protegen efecto, no sólo admisión HTTP.
- **AC-3:** Respuesta perdida conserva intención; no reenviar tras reautenticar automáticamente ni sustituir clave por asumir fallo. `UNCONFIRMED` no demuestra cancelación.
- **AC-4:** Consulta de intención sólo metadatos del actor, sin payloads/respuestas privadas; todos los almacenes críticos deben tener cobertura explícita.
- **AC-5:** Cliente persiste sólo metadatos/digest de reintento, nunca narrativas/credenciales/evidencias privadas; fingerprint compatible no reescribe recibos antiguos.

## Diseño y evidencia

- [Transacción de dominio](../../../backend/src/common/domain/domain-transaction.ts), [consulta](../../../backend/src/operations/operation-intents.controller.ts), [tests](../../../backend/test/unit/operations/remaining-contracts.test.ts).
- Cubiertos: páginas CMS (26/10), asistencia/ausencias, documentos/academia, proyectos/actividades, visitas/inventario, impresión, retención/recuperación y políticas según contrato específico.
- Consulta de intención une siete almacenes: domain, attendance, absence, retention, printing, recovery y gamification.
- Matriz de mutaciones HTTP (26/10, por controlador): clave durable y `DomainTransaction` en asistencia, ausencias, academia, calendario, documentos, periodos, inventario, Kairos, impresión, recuperación, retención, visitas, biblioteca, páginas y activos del CMS, organización (sedes/áreas/turnos), usuarios (actualizar/baja), invitaciones (crear/revocar), política de asistencia, reglas/insignias de gamificación y preferencias de directorio.
- Sin clave por diseño: autenticación y sesión (credenciales y desafíos con rate limit, no efectos de dominio), aceptar invitación (token público de un solo uso), notificaciones (leer es idempotente por estado), subida de archivos (un duplicado queda privado y sin asociar), jobs y manifiestos de operación (clave propia por job/periodo y lease por dueño) y exportación de reportes (cada solicitud es una intención legítima y consultable).
- Invitaciones: el recibo no guarda el token. Se deriva con HMAC (`SESSION_SECRET`, actor y clave); repetir la clave devuelve el mismo token sin crear otra invitación ni otro correo.
- Clasificar un activo público usa una clave de objeto determinista por archivo origen, así un reintento o una carrera no dejan copias huérfanas ni requieren DELETE; las carreras de gamificación y CMS se traducen a su conflicto de dominio dentro de la intención.
- Helpers cliente heredados deben revisarse por caller: no asumir que todos impiden sustituir intención incierta o guardan únicamente digest.
- No renombrar namespaces persistidos de reintento como parte de documentación: hacerlo exige migración compatible específica.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4:** Infraestructura común, replay autorizado y consulta parcial presentes.
- [x] **T2 · código · AC-1/2:** Matriz por controlador e integración en todas las mutaciones con efecto de dominio ([organización](../../../backend/src/organization/services/), [usuarios](../../../backend/src/users/users.service.ts), [invitaciones](../../../backend/src/invitations/invitations.service.ts), [biblioteca](../../../backend/src/library/library.service.ts), [CMS](../../../backend/src/public-content/public-content.service.ts)); pruebas con mocks.
- [x] **T3 · código · AC-3/4/5:** La consulta de intenciones une `DomainOperation` (todas las mutaciones migradas), asistencia, ausencias, retención, impresión, recuperación y gamificación ([controlador](../../../backend/src/operations/operation-intents.controller.ts)); expone sólo metadatos del actor.
- [ ] **T4 · validación · AC-1/2/3:** Dos conexiones, colisión/deadlock/rollback de auditoría, revocación, freeze/unfreeze y respuesta perdida por mutación.
