# Biblioteca operativa

ID: `biblioteca` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Manuales, procedimientos, formatos y políticas versionados por alcance. Decisión 20B.
No reemplaza registros estructurados ni permite edición colaborativa/firma electrónica.

## Reglas y criterios de aceptación

- **AC-1:** Borrador → revisión → publicado → archivado, con autor/revisor, vigencia y resumen; nueva versión nunca sobrescribe la publicada.
- **AC-2:** Alcances global/sede/área/proyecto; coordinación prepara, jefaturas revisan/publican según grants, global sólo con autorización correspondiente.
- **AC-3:** PDF/DOCX/XLSX/PPTX/JPG/PNG hasta 25 MiB, privados/escaneados; descarga autorizada. Acuse registra usuario/versión/fecha, no firma legal ni lectura de notificación.

## Diseño y evidencia

- [Biblioteca](../../../backend/src/library/), [UI](../../../frontend/app/portal/biblioteca/), [tests](../../../backend/test/library.service.spec.ts).
- Dependencias: [archivos](../archivos/spec.md), [comunicaciones](../comunicaciones/spec.md), [retención](../retencion/spec.md).
- Controlador conserva mutaciones sin contrato idempotente uniforme: no declarar cierre transversal por existir versionado.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3:** Versiones, revisión/publicación/archivo, descarga y acuse implementados.
- [ ] **T2 · código · AC-1/2:** Uniformar mutaciones/replay con [escrituras seguras](../escrituras-seguras/spec.md).
- [ ] **T3 · validación · AC-2/3:** Full-stack por alcance, archivos y acuse de versión exacta.
- [ ] **T4 · externo · AC-1/3:** Aprobar contenidos, vigencias y conservación antes de habilitar operación institucional.
