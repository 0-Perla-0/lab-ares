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
- Consulta actual sólo une seis almacenes: domain, attendance, absence, retention, printing y recovery; no es inventario exhaustivo de todas las mutaciones.
- Matriz de mutaciones HTTP (26/10, por controlador; "n/m" = con clave durable): auth 0/14 (sesión y credenciales: no son efectos de dominio; lo limitan desafíos y rate limit), organización 0/9, usuarios 1/4, invitaciones 0/3, notificaciones 0/2 (leer es idempotente por estado), directorio 0/1 (valores absolutos), gamificación 2/4, política de asistencia 4/5, operaciones 7/11 (jobs con lease propio), manifiestos de auditoría 0/1, exportación de reportes 0/1 (el CSV síncrono no muta), subida de archivos 0/1, activos del CMS 0/2. Biblioteca 7/7 y páginas del CMS 4/4 desde el 26/10; el resto de controladores 100 %.
- Decisión (26/10): la creación de invitaciones no guarda recibo durable estándar, porque el recibo conservaría el token en claro; requiere un diseño propio (token derivable o recibo sin secreto) antes de unificarla.
- Pendiente real de clave durable: organización, usuarios, reglas/insignias de gamificación, política de asistencia, activos del CMS, manifiestos y exportación asíncrona. Directorio y notificaciones se dejan sin clave por idempotencia natural (decisión 26/10).
- Helpers cliente heredados deben revisarse por caller: no asumir que todos impiden sustituir intención incierta o guardan únicamente digest.
- No renombrar namespaces persistidos de reintento como parte de documentación: hacerlo exige migración compatible específica.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4:** Infraestructura común, replay autorizado y consulta parcial presentes.
- [ ] **T2 · código · AC-1/2:** Matriz por controlador y biblioteca integrada ([servicio](../../../backend/src/library/library.service.ts)); falta integrar organización, usuarios, gamificación admin, política de asistencia, activos CMS y exportaciones.
- [ ] **T3 · código · AC-3/4/5:** Completar consulta/estado de intenciones y revisar helpers/callers de cada feature, especialmente contenido privado.
- [ ] **T4 · validación · AC-1/2/3:** Dos conexiones, colisión/deadlock/rollback de auditoría, revocación, freeze/unfreeze y respuesta perdida por mutación.
