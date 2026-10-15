# Contenido institucional público

ID: `contenido-publico` · Estado: parcial · Revisión: 2026-10-15

## Objetivo y alcance

Inicio, Servicio Social, FAQ, acerca de, contacto e información legal mediante CMS controlado. Decisión 21B.
Sin autorregistro, formularios anónimos, HTML arbitrario ni exposición de información privada.

## Reglas y criterios de aceptación

- **AC-1:** Texto/encabezados/listas/enlaces/avisos/imágenes/FAQ controlados, versiones y estados borrador/publicado/archivado.
- **AC-2:** Sólo administración global publica; otras autoridades preparan según permiso. Autor/publicador/fecha/resumen quedan trazables.
- **AC-3:** Activos públicos se clasifican explícitamente y copian a espacio público aislado; nunca reutilizar URL de expediente/biblioteca ni publicar personas, horas o invitaciones.
- **AC-4:** Inicio canónico, navegación y metadatos permiten descubrir contenido institucional publicado sin confundir la landing estática con la página CMS `inicio`.

## Diseño y evidencia

- [CMS](../../../backend/src/public-content/), [administración](../../../frontend/app/portal/contenido/), [páginas](../../../frontend/app/contenido/).
- [Pruebas](../../../backend/test/public-content.service.spec.ts), [navegador determinista](../../../frontend/e2e/public-content.spec.ts).
- Brecha comprobada: [la raíz pública](../../../frontend/app/page.tsx) es estática; [header](../../../frontend/components/public/header.tsx) y [footer](../../../frontend/components/public/footer.tsx) sólo enlazan anclas de esa landing y login. Las páginas CMS existen en `/contenido/:slug`, pero no están integradas a esa navegación.
- [La ruta CMS](../../../frontend/app/contenido/[slug]/page.tsx) usa título genérico; los campos SEO publicados no se reflejan en sus metadatos de ruta.
- Dependencias: [archivos](../archivos/spec.md), [escrituras seguras](../escrituras-seguras/spec.md).

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3:** CMS versionado y separación de activos integrados.
- [ ] **T2 · código · AC-2/3:** Uniformar idempotencia/barrera del ciclo de publicación y tratamiento de copias públicas.
- [ ] **T3 · validación · AC-1/3:** Revisión accesible de contenido publicado, permisos negativos y aislamiento real de buckets.
- [ ] **T4 · externo · AC-2/3:** Aprobar contenido/contactos/avisos legales; no inventar identidad institucional ni políticas.
- [ ] **T5 · código · AC-4:** Integrar inicio/navegación/SEO con páginas publicadas y fallback explícito; probar publicación/cambio/archivo desde la ruta canónica, no sólo acceso directo por slug.
