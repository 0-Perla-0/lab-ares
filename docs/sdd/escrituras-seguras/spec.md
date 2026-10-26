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
- Brechas visibles de contrato: organización/usuarios, invitaciones, biblioteca, activos del CMS, preferencias de directorio y exportación de reportes sin clave durable uniforme; algunos endpoints operativos usan clave opcional.
- Helpers cliente heredados deben revisarse por caller: no asumir que todos impiden sustituir intención incierta o guardan únicamente digest.
- No renombrar namespaces persistidos de reintento como parte de documentación: hacerlo exige migración compatible específica.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4:** Infraestructura común, replay autorizado y consulta parcial presentes.
- [ ] **T2 · código · AC-1/2:** Matriz endpoint→servicio→efecto de mutaciones restantes; integrar contrato durable sin romper clientes/recibos previos.
- [ ] **T3 · código · AC-3/4/5:** Completar consulta/estado de intenciones y revisar helpers/callers de cada feature, especialmente contenido privado.
- [ ] **T4 · validación · AC-1/2/3:** Dos conexiones, colisión/deadlock/rollback de auditoría, revocación, freeze/unfreeze y respuesta perdida por mutación.
