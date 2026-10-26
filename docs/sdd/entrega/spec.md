# Entrega y aceptación

ID: `entrega` · Estado: parcial · Revisión: 2026-10-26

## Objetivo y alcance

Gates reproducibles y promoción del mismo digest, con aceptación por feature. Decisiones 18B, 26B, 27B, 30B y 30.1B.
Build/test local verde no autoriza staging, piloto, producción ni supresión/recuperación externa.

## Reglas y criterios de aceptación

- **AC-1:** Separar quality, integración MariaDB, navegador interceptado y full-stack sin mocks de API/storage/scanner/SMTP. Evidencia vinculada al código ensayado.
- **AC-2:** Full-stack usa proyecto/base `_test`/`_ci` y buckets sintéticos nuevos. Un recorrido completo por seed; Newman secuencial después del navegador, nunca reabrir decisiones para repetir.
- **AC-3:** WCAG 2.2 AA con teclado/foco/contraste/zoom/reflujo/lector de pantalla y móvil desde 320 px. Axe/lint no certifican el proceso completo; cámara/geolocalización requieren dispositivo real.
- **AC-4:** Chrome/Edge/Firefox/Safari modernos en escritorio/móvil, estable y dos mayores previas sobre piso Next.js (111/16.4). Probar respuesta perdida, desconexión y carga interrumpida, sin mutaciones offline oficiales.
- **AC-5:** CI del mismo commit, candidato inmutable y promoción del mismo digest; secretos/entornos aislados, runtime/migrador separados, sin reconstruir runtime durante aceptación.
- **AC-6:** Anillos: staging → piloto SS una sede/área (10–25, ≥20 días hábiles) → expansión/expediente → Kairos → módulos complementarios por flag. Parar por duplicidad/exposición/barrera/auditoría inconciliable.
- **AC-7:** Cambiar regla sensible requiere aceptación funcional/operativa y autoridad institucional de datos/permisos/horas cuando aplique. Silencio no aprueba; rollback preserva historia, no restaura DB destructivamente por defecto.

## Diseño y evidencia

- [Scripts](../../../package.json), [CI](../../../.github/workflows/ci.yml), [candidatos manuales](../../../.github/workflows/release-candidate.yml).
- [Compose base](../../../compose.yaml), [aceptación](../../../compose.acceptance.yaml), [candidatos](../../../compose.candidate.yaml), [seed protegido](../../../backend/src/scripts/seed-fullstack-test.ts).
- [Playwright determinista](../../../frontend/e2e/README.md), [suite real](../../../frontend/fullstack/), [Postman](../../../postman/README.md).
- Merge local del 15/10: conservar portal de modales sobre `document.body`, scroll/límites de viewport y tamaños default/wide; validar [regresiones de modales](../../../frontend/e2e/modal-layout.spec.ts) y [recuperación](../../../frontend/e2e/password-recovery.spec.ts) junto a MFA.
- Validación del merge (15/10): `npm run quality` aprobado, 1021 backend/69 frontend más seis regresiones documentales; Prisma/tipos/ambos builds incluidos. URL DB sintética de proceso, sin migrar ni probar una base real.
- `npm run test:e2e`: **111/111** (37 escenarios × Chromium/Firefox/WebKit), APIs interceptadas. Avisos de scroll/FS y solicitudes de fixtures que alcanzaron un proxy sin backend no se presentan como integración real. No se ejecutaron MariaDB/full-stack/restore ni CI remota; `develop` no se publica.
- Integración local del 26/10 (proyecto Compose aislado `ares-it-20261026`, volúmenes nuevos retirados al terminar; MariaDB 11.8, MinIO y Mailpit; bases `ares_ci`, `ares_closure_mail_ci`, `ares_retention_safety_ci` y `ares_object_deletion_ci`): `npm run test:integration` 103 aprobadas y 3 opt-in omitidas, `prisma:drift:check` sin diferencias; opt-in ejecutados aparte: SMTP real con Mailpit 1/1, carreras de retención con journal real 11/11 y borrado exacto en MinIO 21/21 (incluye 3 casos nuevos de adjuntos de ausencia). Sin contenedores de aplicación, full-stack, Newman, restore ni CI remota.
- Navegador interceptado del 26/10 en Chromium (dev server): 122/123. Falla "calendario permite vista previa retroactiva ... 320px": la insignia "Insight" de las herramientas de desarrollo de Next tapa "Crear excepción". Se reproduce también en `d208e81`, previo a estos cambios; `devIndicators: false` no la quita. Firefox y WebKit no se repitieron. `npm audit --omit=dev` del 26/10 reporta 7 avisos (crítico: next; altos: @nestjs/platform-express, multer, body-parser, zod; moderados: fast-uri, nodemailer) y el gate de CI los rechazaría. No se actualizó nada: queda como tarea de dependencias aparte.
- `npm run quality` incluye formato, docs, lint a11y, Prisma, unitarias, tipos/builds; integración/navegador son gates separados.
- Prisma validate/generate exige `DATABASE_URL` aunque no conecte: para quality sin DB usar URL sintética de ensayo sólo en el proceso; no crear `.env` productiva, migrar ni fingir integración real.
- Full-stack: configurar `ARES_FULLSTACK_URL`, `ARES_MAILPIT_URL`, `ARES_FULLSTACK_DB_URL` de stack local nuevo; `npm run test:e2e:fullstack`. Overlay requiere Compose ≥2.24.4 y puertos libres, bind loopback.
- Workflow candidato entregado, sin evidencia de ejecución/publicación remota. Manifiesto `productionAuthorized=false` no aprueba release.
- Dependencias fijadas/overrides en lockfile resolvieron advisories reportados al corte anterior; repetir `npm audit --omit=dev`. No certificar imágenes base/proveedor con ese dato histórico.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/5:** CI/suites/seed/overlays y workflow de candidatos presentes.
- [ ] **T2 · validación · AC-1/3/4:** Completar aceptación real de features restantes, fallos de dependencias, accesibilidad manual y dispositivos/cámara.
- [ ] **T3 · validación · AC-1/5:** Carga/cuotas/multirréplica, instalación fresh/upgrade/grants/deriva y restore coordinado del último código.
- [ ] **T4 · externo · AC-5/6/7:** Ejecutar CI/publicación remota, configurar proveedor/TLS/secrets/proxy/registry y aprobar staging/piloto/promoción/rollback.
- [ ] **T5 · externo · AC-6/7:** Asignar autoridad funcional, operativa, técnica, de datos y de liberación; soporte/capacitación y decisión explícita por anillo, sin reparto por desarrollador.
