# Gamificación privada

ID: `gamificacion` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Puntos, nivel derivado e insignias mínimas. La decisión 31 sustituye el aplazamiento de 8B; MVP obligatorio, no activación automática.
Sin ranking público, monedas, tienda, premios, rachas ni XP por asistencia/puntualidad/horas.

## Reglas y criterios de aceptación

- **AC-1:** Sólo actividad Kairos terminada/aprobada o reconocimiento manual autorizado con motivo otorga puntos.
- **AC-2:** Ledger append-only, concesión idempotente y corrección mediante reverso, nunca edición. Pausar puntos nuevos no impide reversar otorgamientos existentes.
- **AC-3:** Usuario ve sólo su perfil/historial; ADMIN administra reglas/insignias y reconocimientos. Flag/política no amplían RBAC.

## Diseño y evidencia

- [Gamificación](../../../backend/src/gamification/), [UI](../../../frontend/app/portal/gamificacion/), [tests](../../../backend/test/gamification.service.spec.ts).
- `GAMIFICATION_ENABLED=false` por defecto; políticas de otorgamiento general/Kairos verificadas en backend.
- [Pruebas deterministas](../../../frontend/e2e/services-governance.spec.ts), dependencia [Kairos](../kairos/spec.md).

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3:** Reglas, ledger privado, reversos y UI implementados.
- [ ] **T2 · validación · AC-1/2/3:** Aceptación real de aprobación/reapertura/reverso con concurrencia y cambios de flags.
- [ ] **T3 · externo · AC-1/3:** Aprobar reglas institucionales y habilitación del módulo por anillo, sin ampliar recompensas.
