# Expediente documental

ID: `expediente` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Requisitos, versiones, revisión y formalización académica explícita. Decisión 6B.
Formalizar no autoriza todos los documentos, no acredita horas ni libera legalmente Servicio Social.

## Reglas y criterios de aceptación

- **AC-1:** Requisito, archivo y versión son distintos. Cada carga crea versión inmutable; PDF/JPG/PNG hasta 10 MiB, privado y limpio antes de asociación/descarga.
- **AC-2:** Estados funcionales incluyen revisión, autorización, rechazo, corrección, vencido/cancelado; no confundir disponibilidad técnica con autorización.
- **AC-3:** Requisitos, versiones, revisión y formalización son idempotentes/auditados con autorización vigente al replay; reserva de borrado impide asociaciones concurrentes.
- **AC-4:** Otra autoridad con alcance y autenticación reciente formaliza prestador activo con adscripción confirmada que cubre inicio. Constancia append-only con snapshots, única por usuario/fecha.

## Diseño y evidencia

- [Documentos](../../../backend/src/documents/), [UI](../../../frontend/app/portal/expediente/), [Prisma](../../../backend/prisma/schema.prisma).
- [Pruebas](../../../backend/test/documents.service.spec.ts), [formalización real](../../../backend/test/integration/expedient-completion.integration.test.ts), [recorrido](../../../frontend/fullstack/completion.spec.ts).
- Campos de cohorte sede/área se capturan al crear; anteriores quedan desconocidos, no se backfillean por inferencia.
- Dependencias: [academia](../perfil-academico/spec.md), [archivos](../archivos/spec.md), [periodos](../periodos-servicio/spec.md).

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4:** API/UI, constancias y límites coherentes implementados.
- [ ] **T2 · validación · AC-1/3/4:** Completar aceptación de tipos/estados, descargas revocadas y concurrencia por alcance.
- [ ] **T3 · código · AC-3:** Integrar conservación del expediente cuando exista tratamiento aprobado; ver [retención](../retencion/spec.md).
- [ ] **T4 · externo · AC-4:** Aceptación institucional de formalización; no convertirla en constancia de liberación.
