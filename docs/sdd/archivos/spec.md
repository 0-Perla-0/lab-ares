# Archivos privados y cuarentena

ID: `archivos` · Estado: parcial · Revisión: 2026-10-15

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
- Brecha comprobada: worker hace `workersMayMutate` antes de escrituras root de recuperación/claim/exhaustion; no captura época como reportes/retención.
- `UploadBudget` usa un Set local por proceso; no impone cuota global. Escaneo/promoción conservan copias; reconciliador rechaza DELETE general.
- Dependencias: [borrado](../borrado-objetos/spec.md), [operación](../operacion/spec.md).

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3:** Pipeline y descargas autorizadas existentes.
- [ ] **T2 · código · AC-4:** Uniformar lifecycle/claim/renovación/publicación/error por época y lease; probar freeze/unfreeze ABA con dos conexiones.
- [ ] **T3 · código · AC-5:** Diseñar cuotas distribuidas y coordinación de capacidad sin confundir límite local con garantía global.
- [ ] **T4 · código · AC-6:** Limpieza por fases de copias/rechazados/huérfanos sin romper referencias ni holds.
- [ ] **T5 · validación · AC-1/4/5:** Scanner caído/lento, disco lleno, subidas concurrentes y límites de proxy.
