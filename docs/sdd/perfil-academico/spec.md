# Perfil académico

ID: `perfil-academico` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Institución, unidad opcional, programa, cohorte opcional y adscripción histórica del prestador. Decisión 19B.
No concede RBAC, no impide activar cuenta ni preparar/cargar documentos.

## Reglas y criterios de aceptación

- **AC-1:** Prestador solicita cambios; autoridad confirma/rechaza. Catálogos coherentes/activos y fechas de adscripción conservan historia.
- **AC-2:** Mutaciones HTTP académicas usan clave durable, auditoría, barrera y autorización actual también al replay.
- **AC-3:** Formalizar expediente/iniciar periodo exige adscripción confirmada que cubra la fecha; historia ausente no se fabrica.

## Diseño y evidencia

- [Módulo académico](../../../backend/src/academic/), [UI](../../../frontend/app/portal/perfil-academico/), [contratos](../../../backend/src/openapi/).
- [Servicio probado](../../../backend/test/academic.service.spec.ts), [integración](../../../backend/test/integration/remaining-closure.integration.test.ts).
- Dependencias: [expediente](../expediente/spec.md), [periodos](../periodos-servicio/spec.md), [retención](../retencion/spec.md).
- Idempotencia HTTP existe; no asumir la misma garantía en todos los callers internos del servicio.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3:** Solicitudes, catálogos, historia e integración con formalización implementados.
- [ ] **T2 · validación · AC-1/3:** Aceptar correcciones/fechas con casos institucionales y catálogo real.
- [ ] **T3 · externo · AC-1/3:** Autorizar fuentes confiables y conservación; no rellenar historia con asignación actual.
