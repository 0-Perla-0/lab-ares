# SDD por features

SDD significa **Spec-Driven Development**: especificar comportamiento verificable antes de implementarlo.
El [índice](../index.md) descubre features; su `spec.md` es la fuente única de alcance, diseño y tareas.

## Ciclo de trabajo

1. Leer memoria y feature; contrastar sus afirmaciones con código/contratos/pruebas actuales.
2. Especificar alcance, exclusiones, reglas y criterios observables. No convertir una brecha de aceptación en módulo ausente.
3. Diseñar API, datos, permisos, auditoría, idempotencia, recuperación y UI necesarios, sin copiar código o catálogos enteros.
4. Crear tareas pequeñas por resultado vertical, no por responsable o capa; enlazar dependencias entre features.
5. Implementar y probar. Marcar `[x]` sólo con evidencia; documentar bloqueos y gates no ejecutados.
6. Actualizar la misma spec; reemplazar estado obsoleto, no agregar checkpoints. Cambiar memoria sólo si hay contexto estable nuevo.

## Formato y límites

- Una carpeta `docs/sdd/<feature>/` y un `spec.md`, basado en [la plantilla](template.md).
- ID estable por feature, criterios `AC-1…` y tareas `T1…`; cada tarea referencia sus criterios.
- Estados: `propuesta`, `implementada`, `parcial`, `condicionada`. Separar aceptación local de liberación externa.
- Tareas etiquetadas `código`, `validación` o `externo`; no marcar una aprobación externa por tener tests verdes.
- Máximo **120 líneas por Markdown**, incluidas tablas. Si no cabe, extraer una subfeature cohesionada con enlace al padre.
- No crear planes globales, reportes cronológicos largos, matrices de responsables numerados ni archivos de estado duplicados.
- Cambios de regla registran fecha, razón y decisión sustitutiva breve en la feature; no atribuir una aprobación inexistente.
- Logs, trazas y resultados voluminosos son artefactos de CI/ensayo, no Markdown versionado. Nunca publicar secretos o datos reales.
- Preservar contratos ejecutables OpenAPI/Prisma/Postman y tests; no tratarlos como documentos narrativos para borrar.

## Terminado y evidencia

- API/servicio/UI reales, no sólo modelo, selector o fixture; permisos y denegaciones comprobados.
- Migración nueva cuando aplique, fresh/upgrade y deriva en base aislada; no reescribir historia.
- Negocio/auditoría/recibo atómicos; respuesta perdida, revocación, hold y barrera comprobados según riesgo.
- UI con carga/vacío/error/desconocido y reintento seguro; teclado, foco, contraste y móvil.
- Enlazar prueba por criterio y registrar comando, fecha, alcance y resultado del gate ejecutado.
- No confundir unitarias/mocks, integración MariaDB, navegador interceptado, full-stack real y aprobación institucional.
- Un requisito aprobado pero todavía no implementado permanece explícito; no se elimina para declarar cierre.
- Ejecutar `npm run docs:check`: limita tamaño, valida estructura/enlaces locales y rechaza repartos numerados en Markdown.
- `npm run quality` incluye ese gate y mantiene los gates existentes. Integración/full-stack se ejecutan aparte según impacto.
