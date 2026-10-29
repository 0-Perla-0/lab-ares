# Entrega y aceptación

ID: `entrega` · Estado: parcial · Revisión: 2026-10-29

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
- **AC-8:** Desde la raíz, `npm run dev` prepara Prisma y arranca backend/frontend juntos; conserva los comandos separados y detiene ambos al interrumpir o fallar un proceso. El arranque no migra bases, crea cuentas ni habilita workers. Los hosts de desarrollo adicionales se autorizan explícitamente por entorno, sin comodines globales.

## Diseño y evidencia

- [Scripts](../../../package.json), [CI](../../../.github/workflows/ci.yml), [candidatos manuales](../../../.github/workflows/release-candidate.yml).
- [Compose base](../../../compose.yaml), [aceptación](../../../compose.acceptance.yaml), [candidatos](../../../compose.candidate.yaml), [seed protegido](../../../backend/src/scripts/seed-fullstack-test.ts).
- [Playwright determinista](../../../frontend/e2e/README.md), [suite real](../../../frontend/fullstack/), [Postman](../../../postman/README.md).
- Merge local del 15/10: conservar portal de modales sobre `document.body`, scroll/límites de viewport y tamaños default/wide; validar [regresiones de modales](../../../frontend/e2e/modal-layout.spec.ts) y [recuperación](../../../frontend/e2e/password-recovery.spec.ts) junto a MFA.
- Validación del merge (15/10): `npm run quality` aprobado, 1021 backend/69 frontend más seis regresiones documentales; Prisma/tipos/ambos builds incluidos. URL DB sintética de proceso, sin migrar ni probar una base real.
- `npm run test:e2e`: **111/111** (37 escenarios × Chromium/Firefox/WebKit), APIs interceptadas. Avisos de scroll/FS y solicitudes de fixtures que alcanzaron un proxy sin backend no se presentan como integración real. No se ejecutaron MariaDB/full-stack/restore ni CI remota; `develop` no se publica.
- Validación local del 26/10 tras el cierre de código (stack Compose aislado con MariaDB 11.8, MinIO y Mailpit, retirado al terminar): `npm run test:integration` 106 aprobadas y 16 omitidas (3 opt-in y 13 de limpieza, que exigen su base propia `ares_object_cleanup_ci`); `prisma:drift:check` sin diferencias con 37 migraciones; opt-in aparte: SMTP real 1/1, carreras de retención 11/11, borrado exacto en MinIO 21/21 y limpieza de huérfanos, importación tras restore y copias 13/13 (incluye MinIO), admisión de subidas con dos conexiones 3/3. Sin full-stack, Newman, restore ni CI remota.
- Navegador interceptado del 26/10 (Chromium, Firefox y WebKit, APIs interceptadas): 372/372. El fallo de calendario a 320 px era la insignia del aviso de vulnerabilidad de Next 16.4.0 y desapareció al subir a 16.4.3.
- Dependencias (26/10): `next` 16.4.3, `zod` 4.6.7, `nodemailer` 10.2.1, `body-parser` 2.4.0, `fast-uri` 3.1.9 y `multer` 2.5.0 forzado por `overrides` (platform-express 11 lo fija en 2.4.0). `npm audit --omit=dev` queda en 0 avisos; `npm run quality` aprobado con 1072 pruebas de backend y 72 de frontend; retirar el override cuando Nest publique una versión corregida.
- `npm run quality` incluye formato, docs, lint a11y, Prisma, unitarias, tipos/builds; integración/navegador son gates separados.
- Prisma validate/generate exige `DATABASE_URL` aunque no conecte: para quality sin DB usar URL sintética de ensayo sólo en el proceso; no crear `.env` productiva, migrar ni fingir integración real.
- Arranque local: supervisión concurrente de los scripts existentes; `predev` genera Prisma y rechaza la configuración de ejemplo antes de arrancar servicios. La preparación inicial de MariaDB y sus credenciales permanece explícita; no ejecuta migraciones ni bootstrap en cada arranque.
- Validación de AC-8 (29/10): `npm run quality` aprobado (6 documentales, 1072 backend, 72 frontend, tipos y builds). En Windows se comprobó arranque conjunto, parada con Ctrl+C y cierre del frontend al terminar el comando backend; ambos puertos quedaron libres. Con MariaDB/MinIO locales nuevos, readiness 200, login 200 y contenido público sin spinner por localhost/IP; el CMS vacío devuelve 404 y estado no publicado. Es una comprobación de arranque real, no la suite full-stack ni aceptación institucional.
- Full-stack: configurar `ARES_FULLSTACK_URL`, `ARES_MAILPIT_URL`, `ARES_FULLSTACK_DB_URL` de stack local nuevo; `npm run test:e2e:fullstack`. Overlay requiere Compose ≥2.24.4 y puertos libres, bind loopback.
- Workflow candidato entregado, sin evidencia de ejecución/publicación remota. Manifiesto `productionAuthorized=false` no aprueba release.
- Dependencias fijadas/overrides en lockfile resolvieron advisories reportados al corte anterior; repetir `npm audit --omit=dev`. No certificar imágenes base/proveedor con ese dato histórico.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/5:** CI/suites/seed/overlays y workflow de candidatos presentes.
- [ ] **T2 · validación · AC-1/3/4:** Completar aceptación real de features restantes, fallos de dependencias, accesibilidad manual y dispositivos/cámara.
- [ ] **T3 · validación · AC-1/5:** Carga/cuotas/multirréplica, instalación fresh/upgrade/grants/deriva y restore coordinado del último código.
- [ ] **T4 · externo · AC-5/6/7:** Ejecutar CI/publicación remota, configurar proveedor/TLS/secrets/proxy/registry y aprobar staging/piloto/promoción/rollback.
- [ ] **T5 · externo · AC-6/7:** Asignar autoridad funcional, operativa, técnica, de datos y de liberación; soporte/capacitación y decisión explícita por anillo, sin reparto por desarrollador.
- [x] **T6 · código · AC-8:** Añadir arranque conjunto y hosts locales configurables y actualizar la instalación inicial.
- [x] **T7 · validación · AC-8:** Comprobar arranque/parada real en Windows más quality. La base usada para la comprobación debe ser local nueva y permanecer separada de bases existentes.
