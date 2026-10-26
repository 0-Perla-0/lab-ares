# Reportes operativos

ID: `reportes` · Estado: parcial · Revisión: 2026-10-26

## Objetivo y alcance

Métricas de asistencia/validación/ausencias/documentos/Kairos y CSV privado. Decisión 9B.
No reconstruye estados punto-en-el-tiempo de documentos/Kairos ni inventa organización histórica faltante.

## Reglas y criterios de aceptación

- **AC-1:** Alcance backend e historia capturada al crear; traslados/inactivaciones no borran contribución. `coverage.unknownHistoryExcluded` informa cohortes sin snapshot.
- **AC-2:** CSV UTF-8, síncrono hasta 5000 filas; excedente asíncrono por cursor de 1000, spool privado, checksum, longitud y techo técnico de bytes.
- **AC-3:** Claim/renovación/publicación protegen barrera y época; perder lease impide publicar. Descarga revalida cuenta/permiso/snapshot original, no sólo permiso actual más amplio.
- **AC-4:** URL privada de 300 s; revocar cuenta no revoca instantáneamente una URL ya emitida. Firmar host accesible desde origen, no reemplazarlo después.
- **AC-5:** Si se requiere estado histórico exacto, diseñar/capturar eventos suficientes antes de ofrecerlo; marcar historia desconocida en lugar de backfill inferido.

## Diseño y evidencia

- [Reportes](../../../backend/src/reports/), [UI](../../../frontend/app/portal/reportes/), [tests](../../../backend/test/reports.service.spec.ts).
- [CSV real de 5001 filas](../../../frontend/fullstack/report-streaming.spec.ts), [integración de barrera](../../../backend/test/integration/remaining-closure.integration.test.ts).
- Decisión (26/10): T2 no se implementa mientras la aceptación no exija estados históricos exactos de documentos/Kairos; hoy sólo hay cohortes con snapshot y `unknownHistoryExcluded`. Si se exige, primero se define qué eventos capturar y desde qué corte.
- `REPORTS_MAX_BYTES` es techo técnico, no política institucional; dimensionar disco.
- `S3_DOWNLOAD_ENDPOINT` firma host público permitido; HTTPS en producción. Limpieza terminal depende de [borrado durable](../borrado-objetos/spec.md).

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4:** Reportes por cohorte, CSV paginado y descarga revalidada presentes.
- [ ] **T2 · código · AC-5:** Especificar/implementar temporalidad restante si la aceptación requiere estados históricos exactos.
- [ ] **T3 · validación · AC-2/3:** Carga grande, disco lleno, pérdida de lease/replica y respuesta S3 incierta; 5001 filas no certifica capacidad.
- [ ] **T4 · externo · AC-1/5:** Autorizar fuentes/backfill verificable; nunca rellenar adscripción con la cuenta actual.
