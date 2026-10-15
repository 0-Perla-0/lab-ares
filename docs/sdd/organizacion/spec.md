# Organización y usuarios

ID: `organizacion` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Sedes, áreas, turnos, cuentas y adscripción operativa; autoridad única para RBAC. Academia permanece separada.

## Reglas y criterios de aceptación

- **AC-1:** Permiso más alcance `self/area/sede/global` centralizados; coordinación/jefatura de área operan en área, jefatura de sede en sede y autoridades globales en global.
- **AC-2:** Crear sede exige global; mover área/turno/usuario comprueba origen y destino. No gestionar roles superiores ni darse de baja a sí mismo.
- **AC-3:** Cambios sensibles de cuenta revocan sesiones y registran auditoría/outbox; desactivación conserva historial. Alta HTTP con contraseña está retirada (410): usar invitaciones.
- **AC-4:** `OperationalHistory` registra estado/asignación/organización en la transacción desde el corte UTC de despliegue; nunca desde `createdAt` inferido.

## Diseño y evidencia

- [Permisos ejecutables](../../../backend/src/auth/permissions.ts), [organización](../../../backend/src/organization/), [usuarios](../../../backend/src/users/).
- UI: [sedes](../../../frontend/app/portal/sedes/), [áreas](../../../frontend/app/portal/areas/), [turnos](../../../frontend/app/portal/turnos/), [usuarios](../../../frontend/app/portal/usuarios/).
- [Política de usuarios](../../../backend/src/users/users.policy.ts), [tests](../../../backend/test/unit/users/), [historia operativa real](../../../backend/test/integration/acceptance-hardening.integration.test.ts).
- Brecha: los controladores de organización/usuarios no tienen el contrato durable uniforme de [escrituras seguras](../escrituras-seguras/spec.md).

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4:** CRUD lógico, permisos, revocación e historia transaccional existentes.
- [ ] **T2 · código · AC-2/3:** Incorporar mutaciones restantes a idempotencia/barrera/intenciones uniformes sin invalidar clientes existentes.
- [ ] **T3 · validación · AC-1/4:** Probar traslados/desactivaciones concurrentes con evaluación y workers.
- [ ] **T4 · externo · AC-1:** Revisar grants/roles heredados y asignaciones institucionales antes del piloto.
