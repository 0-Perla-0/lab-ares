# Visitas privadas

ID: `visitas` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Invitación temporal, código/QR, entrada/salida y cancelación. Decisión 31 conserva límites de 12B.
Visitante sin cuenta, sin preregistro público ni apertura física de puertas; no crear rol de recepción sin aprobación.

## Reglas y criterios de aceptación

- **AC-1:** Código opaco privado, ventana máxima 24 h; QR identifica pero no autoriza. Entrada exige identidad física verificada por personal con permiso/alcance.
- **AC-2:** Emitida → entrada → salida, o vencida/cancelada. Salida de quien está dentro sigue disponible tras vencimiento/pausa.
- **AC-3:** Mutaciones idempotentes, versión observada y auditoría transaccional. No almacenar foto/copia de identificación ni código crudo en auditoría/replay/logs.
- **AC-4:** Keyring versionado sin fallback: conservar clave antigua preserva códigos; retirar versión impide consulta/entrada y requiere cancelación/reemisión, no impide salida.

## Diseño y evidencia

- [Visitas](../../../backend/src/visits/), [UI](../../../frontend/app/portal/visitas/), [integración](../../../backend/test/integration/operational-phases.integration.test.ts).
- `VISITS_ENABLED=false`; `VISITS_TOKEN_ACTIVE_VERSION`, `VISITS_TOKEN_KEYRING` y clave dedicada protegida. Versión por invitación, hash persistido.
- Cámara `jsqr` local bajo acción explícita, detenida al cerrar/decodificar; código manual siempre disponible.
- [Full-stack](../../../frontend/fullstack/operational.spec.ts) no sustituye prueba de cámara física.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4:** Invitaciones/control, keyring y cierres seguros implementados.
- [ ] **T2 · validación · AC-1/4:** Cámara móvil real, rotación multirréplica y prueba de claves retiradas en operación.
- [ ] **T3 · externo · AC-1/4:** Custodia/rotación de claves y personal con grants aprobados; no suplantar jefaturas.
