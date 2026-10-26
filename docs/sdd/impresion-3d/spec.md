# Impresión 3D

ID: `impresion-3d` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Trabajo canónico con STL privado y ejecuciones separadas por operador. Decisión 31 conserva límites de 11B.
Sin laminado, control de impresora, cotización/cobro, marketplace ni 3MF inicial.

## Reglas y criterios de aceptación

- **AC-1:** Solicitado → revisión → aprobado/cola → impresión → completado/fallido, con rechazo/cancelación según estado. Cada ejecución tiene inicio/fin/material/resultado.
- **AC-2:** Archivo propio STL validado estructuralmente y escaneado antes de uso; descargas privadas por alcance/rol.
- **AC-3:** Operador asignado ejecuta; reintento sólo desde fallo y con intención durable. Mutaciones críticas idempotentes/auditadas; pausa no impide cerrar pendientes.

## Diseño y evidencia

- [Servicio](../../../backend/src/printing-3d/), [UI](../../../frontend/app/portal/impresion-3d/), [tests](../../../backend/test/printing-3d.service.spec.ts).
- `PRINTING_3D_ENABLED=false` por defecto; solicitante y operador alternan sesiones, sin simular permisos en UI.
- Dependencias: [archivos](../archivos/spec.md), [comunicaciones](../comunicaciones/spec.md), [retención](../retencion/spec.md).

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3:** Modelo/API/UI, ejecuciones, descarga y reintento existentes.
- [ ] **T2 · validación · AC-1/2/3:** Recorrido real STL/scanner/operador/fallo/reintento y concurrencia de finalización.
- [ ] **T3 · externo · AC-2:** Aprobar el tratamiento de archivos STL y su ciclo de vida. No hay código pendiente que inventar: al aprobarse el tratamiento se añade un adaptador por categoría con el patrón de [evidencia operativa](../../../backend/src/retention/operational-evidence.ts) y [retención](../retencion/spec.md), activable sólo con la aprobación institucional.
- [ ] **T4 · externo · AC-3:** Aprobar operación/operadores y activación por anillo; sin control físico automatizado.
