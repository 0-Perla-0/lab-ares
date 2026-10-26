# Directorio interno

ID: `directorio` · Estado: implementada · Revisión: 2026-10-15

## Objetivo y alcance

Contactos institucionales internos por área/proyecto y preferencias de privacidad. Decisión 10B. Nunca directorio público.

## Reglas y criterios de aceptación

- **AC-1:** Backend filtra usuarios y campos visibles según alcance/contexto y preferencias; inactivos se ocultan sin borrar historia.
- **AC-2:** Sólo el titular cambia preferencias propias; no exponer credenciales, IP, expedientes ni contactos privados por un grant genérico.

## Diseño y evidencia

- [Servicio y controlador](../../../backend/src/directory/), [UI](../../../frontend/app/portal/directorio/), [pruebas](../../../backend/test/directory.service.spec.ts).
- `GET /api/directory`, `GET|PATCH /api/directory/preferences/me`.
- El grant de catálogo no convierte usuarios en datos públicos: el filtro de dominio mantiene la privacidad.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2:** Consulta y preferencias existentes con filtrado backend.
- [ ] **T2 · validación · AC-1/2:** Aceptación real con bajas/membresías revocadas y cruce de áreas.
- [x] **T3 · código · AC-2:** Las preferencias exigen `Idempotency-Key` y corren en `DomainTransaction` ([servicio](../../../backend/src/directory/directory.service.ts), [pruebas](../../../backend/test/directory.service.spec.ts)).
