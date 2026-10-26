# Archivos privados y cuarentena

ID: `archivos` · Estado: parcial · Revisión: 2026-10-26

## Objetivo y alcance

Carga, spool privado, huella, análisis antimalware, promoción y descarga autorizada. Decisión 23B.
No usar servicios públicos para analizar justificantes/expedientes ni exponer rutas de objetos.

## Reglas y criterios de aceptación

- **AC-1:** Validar permiso/tamaño/extensión/MIME detectado/firma/estructura, no `Content-Type` declarado. Privado hasta resultado limpio; fallo de scanner nunca equivale a limpio.
- **AC-2:** Estados técnicos separados de revisión funcional; `ELIMINACION_PENDIENTE` no disponible y no es eliminación física certificada.
- **AC-3:** Descarga sólo por autorización/capability breve y archivo disponible; una reserva de borrado impide nuevos enlaces bajo lock.
- **AC-4:** Toda escritura durable del worker debe validar época/barrera y lease vigente al efecto, no sólo una consulta anterior al claim.
- **AC-5:** Admisión/capacidad deben acotar recursos entre réplicas; spool evita buffer HTTP completo, pero no garantiza disco libre ni cuota distribuida.
- **AC-6:** Objetivo aprobado de retirar binarios peligrosos sigue abierto: no hacerlo mediante DELETE sin intención durable. Copias privadas conservadas requieren gobierno/capacidad explícitos.

## Diseño y evidencia

- [Storage](../../../backend/src/storage/), [worker](../../../backend/src/storage/storage.worker.ts), [presupuesto local](../../../backend/src/storage/upload-budget.ts).
- [Tests](../../../backend/test/unit/storage/), [scanner real](../../../frontend/fullstack/operational.spec.ts), [upload controller](../../../backend/src/storage/files.controller.ts).
- Desde el 26/10 el worker fija la época en su primera escritura (recuperar leases vencidos) y exige la misma en el reclamo, el resultado del escaneo y el agotamiento; una época movida termina el ciclo sin registrar un falso `ERROR` del scanner y deja el lease expirar.
- `UploadBudget` usa un Set local por proceso; no impone cuota global. Escaneo/promoción conservan copias; reconciliador rechaza DELETE general.
- Dependencias: [borrado](../borrado-objetos/spec.md), [operación](../operacion/spec.md).

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3:** Pipeline y descargas autorizadas existentes.
- [x] **T2 · código · AC-4:** Lifecycle por época y lease en [worker](../../../backend/src/storage/storage.worker.ts) y [análisis](../../../backend/src/storage/storage.service.ts); [pruebas](../../../backend/test/unit/storage/storage.regressions.test.ts) con mocks. El ABA con dos conexiones reales sigue en T5.
- [ ] **T3 · código · AC-5:** Diseño (26/10): admisión con reserva en MariaDB (fila por usuario/global con contador y lease, liberada al terminar o expirar), no un Set por proceso; requiere migración y límites aprobados. Pendiente de implementar.
- [x] **T4 · código · AC-6:** Limpieza por fases de copias y huérfanos sin romper referencias ni holds ([borrado](../borrado-objetos/spec.md)); candidatos de sólo lectura en `GET /api/retention/object-cleanup/candidates`.
- [ ] **T5 · validación · AC-1/4/5:** Scanner caído/lento, disco lleno, subidas concurrentes y límites de proxy.
