# Operación, auditoría y políticas

ID: `operacion` · Estado: parcial · Revisión: 2026-10-15

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
- Cobertura parcial comprobada: scanner/dispatcher conservan controles anteriores; flags sólo cubren keys declaradas, no todas las mutaciones ni funciones automáticas.
- Provisión: [cuenta runtime](../../../backend/src/scripts/provision-runtime-db.ts), sin DDL/GRANT ni permisos globales; volver a provisionar tras tablas nuevas y revisar roles heredados.
- Soporte conserva objetivos internos: S1 reconocimiento 15 min/mitigación 1 h; S2 1 h/mismo día; S3 1 día/plan 3 días; S4 clasificación 3 días hábiles. No es SLA externo.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/4/5/6:** Consolas, auditoría/manifiestos, políticas, jobs/incidentes y monitor existentes.
- [ ] **T2 · código · AC-3/4:** Matriz de todos los workers/mutaciones/flags; cerrar scanner, outbox, cleanup, reconciliación, manifiestos y telemetría sin atribuir garantías no probadas.
- [ ] **T3 · validación · AC-2/3/5:** Ensayo multirréplica HTTP/colas, leases vencidos, freezes y alertas reales por feature.
- [ ] **T4 · externo · AC-5/6:** Aprobar thresholds/destinatarios, canal y responsables nominales antes del piloto. Cobertura propuesta hábil 08–18 h México, guardia pasiva primeras dos semanas; no prometer 24/7.
