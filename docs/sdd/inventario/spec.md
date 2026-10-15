# Inventario operativo

ID: `inventario` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Consumibles, activos, ubicaciones, movimientos y préstamos. Decisión 31 conserva límites de 13B.
Sin compras, finanzas, proveedores, depreciación, ERP ni préstamos de consumibles.

## Reglas y criterios de aceptación

- **AC-1:** Ledger append-only como origen de existencias. `cantidadStock` es materialización comprobada, no campo editable.
- **AC-2:** Consumible usa cantidad/unidad y dos decimales; ajuste es delta firmado. No cero inválido, stock negativo ni overflow.
- **AC-3:** Activo único, préstamo/retorno una sola vez bajo lock, receptor en alcance y estado físico revisado. Discrepancia falla `INVENTORY_LEDGER_MISMATCH`, no repara pasado silenciosamente.
- **AC-4:** Negocio/auditoría/recibo atómicos; runtime sólo `SELECT, INSERT` sobre movimientos y FKs restrictivas. Comprobación periódica alerta, no edita ledger.

## Diseño y evidencia

- [Inventario](../../../backend/src/inventory/), [UI](../../../frontend/app/portal/inventario/), [integración](../../../backend/test/integration/operational-phases.integration.test.ts).
- `INVENTORY_ENABLED=false`; `INVENTORY_CHECK_WORKER_ENABLED=false` por defecto.
- [Provisioning de grants](../../../backend/src/scripts/provision-runtime-db.ts), [migración de protección](../../../backend/prisma/migrations/20261011122000_inventory_ledger_guards/).
- [Full-stack](../../../frontend/fullstack/operational.spec.ts). Privilegios de administrador DB no equivalen a WORM.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4:** Ledger/stock/préstamos/retorno y worker de comprobación presentes.
- [ ] **T2 · validación · AC-3/4:** Aceptación multirréplica, presupuesto/reintento, freezes y alerta real ante discrepancia.
- [ ] **T3 · externo · AC-1/4:** Conciliar inventario inicial confiable y revisar grants reales/roles heredados antes de piloto.
