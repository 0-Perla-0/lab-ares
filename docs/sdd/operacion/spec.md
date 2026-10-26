# Operación, auditoría y políticas

ID: `operacion` · Estado: parcial · Revisión: 2026-10-26

## Objetivo y alcance

Auditoría append-only, manifiestos, salud, colas/jobs, SLO, incidentes y flags por alcance. Decisiones 25B, 26B y 28B.
Sin ejecutar trabajos por un heartbeat, reparar ledger silenciosamente ni interpretar hash como firma legal/WORM.

## Reglas y criterios de aceptación

- **AC-1:** Evento sensible con actor/alcance/correlación/acción/objeto/resultado y diff permitido; atómico con negocio. Nunca credenciales, narrativas privadas ni cuerpos completos.
- **AC-2:** Hashes/cadenas/manifiestos privados detectan alteraciones; consulta/exportación se audita y respeta alcance. Runtime restringido, administrador DB no queda físicamente impedido.
- **AC-3:** Cada worker debe declarar claim/lease/renovación/efecto/finalización/error, época y reintento bajo barrera; probar réplicas y ABA. No basta `workersMayMutate` antes del trabajo.
- **AC-4:** Flags/piloto intersectan RBAC y se revalidan en efectos de nuevo trabajo; apagar no impide cierre/cancelación/retorno/reverso de pendientes autorizados.
- **AC-5:** SLO usa thresholds explícitos, coalescencia entre réplicas y datos redactados. Heartbeat reciente no prueba éxito individual ni correo entregado.
- **AC-6:** Incidente S1–S4 conserva ticket externo, motivo/responsable/historia y comunicación; S1/S2 repetido requiere revisión en dos días hábiles. No borrar evidencia.

## Diseño y evidencia

- [Operaciones/auditoría](../../../backend/src/operations/), [políticas](../../../backend/src/common/domain/feature-policies.service.ts), [barrera](../../../backend/src/recovery/barrier.ts).
- UI: [consolas](../../../frontend/app/portal/admin/); [tests de integridad](../../../backend/test/unit/operations/audit.integrity.spec.ts), [SLO](../../../backend/test/unit/operations/queue-monitor.test.ts).
- SLO opt-in: outbox/storage/reports/retention/suppressionJournal/objectDeletion. Monitor apagado por defecto; nombres/configuración canónicos en [entorno](../../../backend/src/config/environment.ts).
- Cobertura parcial comprobada: flags sólo cubren keys declaradas, no todas las mutaciones ni funciones automáticas.
- Matriz de workers (26/10, por lectura de código; "época" = efecto confirmado con `withWorkerWriteBarrier` en la versión del claim):
  - Con época: outbox/`EmailDelivery`, scanner de archivos, limpieza de identidad, asistencia (cierre vencido), evaluación de ausencias, chequeo de inventario, manifiestos de auditoría (job, manifiesto y evento en la misma transacción), reportes, retención y diario de supresión.
  - Sin época por diseño: el reconciliador de almacenamiento sólo ejecuta dentro de la corrida de recuperación que posee la barrera (`assertRecoveryBarrier`, versión de la corrida); el monitor de colas sólo lee y alerta. Todos los demás workers publican latido, incluida la limpieza de identidad.
  - La limpieza de identidad no tiene flag propio: corre cada 15 min y al arrancar, respeta la barrera y conserva su tratamiento provisional.
- Matriz de flags (26/10): el piso de módulo es `<MÓDULO>_ENABLED` para VISITS, INVENTORY, PRINTING_3D y GAMIFICATION; ATTENDANCE, DOCUMENTS, KAIROS y ABSENCES sólo se gobiernan por política y piloto. Una política de módulo cubre todas sus subllaves. Nuevo trabajo exige la subllave: `VISITS.REQUEST`, `INVENTORY.MOVEMENT`, `PRINTING_3D.REQUEST`, `GAMIFICATION.AWARD`/`KAIROS_AWARD`, `ATTENDANCE.CONTINGENCY`, `DOCUMENTS.UPLOAD`/`FORMALIZE`/`PERIOD`, `KAIROS.PROJECT`/`ACTIVITY` y `ABSENCES.GENERATE`; cierres, cancelaciones y reversos no se bloquean. Biblioteca, calendario y perfil académico no tienen llave por decisión: se gobiernan por RBAC.
- Provisión: [cuenta runtime](../../../backend/src/scripts/provision-runtime-db.ts), sin DDL/GRANT ni permisos globales; volver a provisionar tras tablas nuevas y revisar roles heredados.
- Soporte conserva objetivos internos: S1 reconocimiento 15 min/mitigación 1 h; S2 1 h/mismo día; S3 1 día/plan 3 días; S4 clasificación 3 días hábiles. No es SLA externo.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/4/5/6:** Consolas, auditoría/manifiestos, políticas, jobs/incidentes y monitor existentes.
- [x] **T2 · código · AC-3/4:** Matriz de workers, mutaciones y flags; época en todos los workers que escriben y latido en todos los planificados ([pruebas](../../../backend/test/unit/storage/storage.worker.test.ts), [asistencia](../../../backend/test/unit/attendance/attendance-worker.test.ts), [manifiestos](../../../backend/test/unit/operations/audit-manifest-worker.test.ts), [ausencias](../../../backend/test/unit/absences/absence-worker.test.ts)); el ABA con dos réplicas reales queda en T3.
- [ ] **T3 · validación · AC-2/3/5:** Ensayo multirréplica HTTP/colas, leases vencidos, freezes y alertas reales por feature.
- [ ] **T4 · externo · AC-5/6:** Aprobar thresholds/destinatarios, canal y responsables nominales antes del piloto. Cobertura propuesta hábil 08–18 h México, guardia pasiva primeras dos semanas; no prometer 24/7.
