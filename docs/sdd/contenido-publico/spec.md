# Contenido institucional público

ID: `contenido-publico` · Estado: parcial · Revisión: 2026-10-26

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
- Decisión (26/10): la raíz estática es la landing canónica; la página CMS `inicio` sigue en `/contenido/inicio` y no se enlaza. [Header](../../../frontend/components/public/header.tsx) y [footer](../../../frontend/components/public/footer.tsx) enlazan las páginas CMS desde [una lista única](../../../frontend/components/public/institutional-links.ts).
- [La ruta CMS](../../../frontend/app/contenido/[slug]/page.tsx) genera metadatos (SEO, canónica) desde la versión publicada vía lectura de servidor (`public-content-server.ts`) con revalidación de 60 s; sin versión publicada cae al título genérico y la página muestra un estado explícito "aún no está publicada".
- Crear página/versión, publicar y archivar página exigen `Idempotency-Key` y usan `DomainTransaction` (barrera, actor vigente, auditoría y recibo atómicos). Clasificar y archivar activos usan el mismo contrato; la copia pública es determinista por archivo.
- Dependencias: [archivos](../archivos/spec.md), [escrituras seguras](../escrituras-seguras/spec.md).

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3:** CMS versionado y separación de activos integrados.
- [x] **T2 · código · AC-2/3:** Páginas y activos (clasificar/archivar) con clave durable; la copia pública tiene clave determinista por archivo, sin DELETE desde una transacción fallida ([servicio](../../../backend/src/public-content/public-content.service.ts), [pruebas](../../../backend/test/public-content.service.spec.ts)).
- [ ] **T3 · validación · AC-1/3:** Revisión accesible de contenido publicado, permisos negativos y aislamiento real de buckets.
- [ ] **T4 · externo · AC-2/3:** Aprobar contenido/contactos/avisos legales; no inventar identidad institucional ni políticas.
- [x] **T5 · código · AC-4:** Navegación, SEO y fallback explícito; [e2e interceptado](../../../frontend/e2e/public-content.spec.ts) cubre enlace desde la landing y página sin publicar. Publicación/archivo reales de extremo a extremo siguen en T3.
