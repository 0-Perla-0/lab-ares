# Guía de trabajo de Ares

## Contexto y desarrollo

- Leer [MEMORY.md](MEMORY.md), el [índice SDD](docs/index.md) y la especificación de la feature antes de cambiar código.
- Monorepo: `frontend/` usa Next.js App Router; `backend/` usa NestJS, Zod, Prisma y MariaDB.
- Desde la raíz: `npm run dev:frontend` (4321) y `npm run dev:backend` (3000).
- El frontend reescribe `/api/*` al backend; permisos, estados y reglas los decide el servidor.
- Conservar cambios ajenos. No activar workers, borrar datos, desplegar ni ejecutar recuperación externa sin autorización.

## Git Flow por feature

- Trabajar en `feature/<feature>` o `feature/docs/<cambio>`; integrar hacia `develop`.
- Usar `release/<version>` y `hotfix/<incidencia>` cuando corresponda.
- Una feature incluye API, UI, datos y pruebas; no asignar funcionalidades por personas o capas numeradas.
- Los nombres técnicos heredados no delimitan responsabilidades; renombrarlos requiere una tarea explícita compatible con datos y reintentos existentes.
- No hacer commit, push o merge salvo petición explícita.

## SDD: especificación antes de implementación

- Seguir [el flujo SDD](docs/sdd/README.md). Cada feature vive en `docs/sdd/<feature>/spec.md`.
- Antes de implementar: actualizar alcance, reglas, diseño y criterios de aceptación; después ejecutar las tareas de esa misma feature.
- Al terminar: marcar sólo tareas comprobadas, enlazar código/pruebas y declarar los gates no ejecutados.
- Separar pendiente de código, validación pendiente y aprobación externa; un modelo o test mock no cierra un recorrido.
- Mantener cada Markdown en **120 líneas como máximo**. Dividir por subfeature si crece; no crear planes maestros, bitácoras acumulativas ni copias del estado.
- `MEMORY.md` contiene sólo contexto estable y advertencias de continuidad; no duplica el backlog ni guarda secretos.
- OpenAPI y Prisma son contratos técnicos ejecutables; no copiar sus tablas completas a Markdown.
- No recrear los documentos monolíticos retirados. Las decisiones vigentes se mantienen en la feature afectada.

## Invariantes y comprobaciones

- Permiso y alcance vigentes en backend; auditoría y cambios críticos en la misma transacción.
- Mutaciones críticas idempotentes; un resultado desconocido no es fallo confirmado ni autoriza una intención nueva.
- No inferir historia desconocida, acreditar horas automáticamente ni inventar políticas institucionales.
- MariaDB y S3 no comparten rollback; respetar reservas de borrado, holds, leases y barrera de recuperación.
- No editar migraciones históricas ni reutilizar seeds/decisiones consumidos. Integraciones sólo en bases nuevas `_test`/`_ci`.
- Ejecutar `npm run docs:check` y `npm run quality`; añadir integración/navegador según el impacto.
- Distinguir pruebas unitarias, navegador interceptado, full-stack real y aceptación institucional. No trasladar evidencia histórica a cambios nuevos.
- UI online-first, accesible y adaptable desde 320 px; WCAG AA requiere revisión manual además de automatización.

## Referencias frontend

- Cumplir [frontend/AGENTS.md](frontend/AGENTS.md) y consultar las guías locales de la versión instalada antes de escribir código Next.js.
- Referencias oficiales: [App Router](https://nextjs.org/docs/app), [layouts](https://nextjs.org/docs/app/getting-started/layouts-and-pages), [Server/Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites), [Tailwind](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
