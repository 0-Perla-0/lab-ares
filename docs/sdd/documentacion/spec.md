# Documentación SDD

ID: `documentacion` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Sustituir planes/checkpoints monolíticos por especificaciones breves de features completas, conservando reglas vigentes y límites de seguridad.
No cambiar lógica de negocio ni renombrar namespaces persistidos para limpiar nombres históricos.

## Reglas y criterios de aceptación

- **AC-1:** Índice enlaza cada feature; su spec contiene alcance, reglas/criterios, diseño/evidencia y tareas de código/validación/externas.
- **AC-2:** Cada Markdown propio ≤120 líneas; sin matrices de responsables numerados, duplicación de estados ni documentos extensos archivados.
- **AC-3:** AGENTS/MEMORY/README y referencias técnicas apuntan al SDD; no quedan enlaces locales rotos ni tests buscando artefactos movidos.
- **AC-4:** Gate automático prueba tamaño/enlaces/estructura/IDs/tareas y forma parte de quality; formato incluye specs/scripts nuevos.

## Diseño y evidencia

- [Índice](../../index.md), [flujo](../README.md), [plantilla](../template.md), [memoria](../../../MEMORY.md), [agentes](../../../AGENTS.md).
- [Validador](../../../scripts/check-docs.mjs), [política](../../../scripts/docs-policy.mjs), [pruebas](../../../scripts/docs-policy.test.mjs).
- Contratos OpenAPI/Prisma/Postman se conservan; colección adicional renombrada por funcionalidad y test consumidor actualizado.
- `npm run docs:check` (15/10/2026): seis regresiones aprobadas y 39 Markdown válidos; máximo actual 56 líneas por archivo.
- `npm run quality` aprobado (15/10/2026): formato, lint a11y, Prisma validate/generate, 1021 pruebas backend/68 frontend, tipos y ambos builds. Primera ejecución bloqueada por falta de `DATABASE_URL`; repetición con URL sintética sólo en el proceso, sin migraciones ni conexión a una base real.
- Integración MariaDB, navegador, full-stack, restauración y CI remota no ejecutados en esta actividad. No presentar evidencia histórica como aceptación nueva.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3:** Migrar reglas/pendientes a features y retirar narrativas monolíticas/estado paralelo.
- [x] **T2 · código · AC-4:** Gate de política documental con regresiones y cobertura de formato incorporado a quality.
- [x] **T3 · validación · AC-1/2/3/4:** Gate, formato, tests afectados y quality aprobados; resultados y límites registrados arriba.
