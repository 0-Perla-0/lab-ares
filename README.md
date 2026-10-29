# Ares

Plataforma de Servicio Social, proyectos Kairos y servicios del laboratorio.
Monorepo con Next.js/React en `frontend/` y NestJS/Prisma/MariaDB en `backend/`.

## Inicio local

Usar la versión de Node de [`.nvmrc`](.nvmrc) y npm compatible con el lockfile.

En PowerShell, copia la plantilla sólo si todavía no existe `.env`:

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edita `.env` antes de ejecutar Prisma: sustituye todas las credenciales de ejemplo. `DATABASE_URL` debe usar el mismo password que `MARIADB_PASSWORD`, y `SESSION_SECRET`, `MFA_ENCRYPTION_KEY` y `OUTBOX_ENCRYPTION_KEY` deben ser valores aleatorios distintos de al menos 32 caracteres. Para una base nueva local, Compose publica MariaDB en `127.0.0.1:3307`.

Con Docker Desktop iniciado, levanta la base local nueva y el almacenamiento de archivos:

```bash
docker compose up -d --wait database storage
npm run prisma:generate
npm run prisma:migrate:deploy
```

Usa `prisma:migrate:deploy` únicamente con una base local nueva o ya verificada; no lo ejecutes contra una base compartida. El bootstrap inicial es opcional y requiere temporalmente `BOOTSTRAP_ADMIN_CODE`, `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` (12–128 caracteres). No se ejecuta automáticamente al arrancar.
No usar la cuenta migradora como runtime productivo; Compose separa migración y permisos por tabla.

Para arrancar frontend y backend juntos, desde la raíz:

```bash
npm run dev
```

`npm run dev` genera Prisma y supervisa ambos servicios; si uno termina o pulsas `Ctrl+C`, detiene el otro. No ejecuta migraciones ni bootstrap y respeta los flags de workers. También puedes ejecutarlos por separado con `npm run dev:backend` y `npm run dev:frontend`.
Para explorar sin trabajos de fondo, mantén apagados los flags `*_WORKER_ENABLED`, `STORAGE_SCANNER_ENABLED`, `STORAGE_RECONCILER_ENABLED` y `OBJECT_CLEANUP_ENABLED` de tu entorno local.
Frontend: `http://localhost:4321`; backend: `http://localhost:3000`.
El proxy `/api/*` mantiene la cookie HTTP-only bajo el mismo origen. `API_PROXY_TARGET` permite configurar el destino. `localhost` es el origen recomendado; para abrir el frontend por una IP, define opcionalmente `ARES_DEV_ALLOWED_ORIGINS` en `frontend/.env.local` como hostnames/IP separados por comas, sin protocolo ni puerto.
MariaDB, MinIO, ClamAV y Mailpit están definidos en [compose.yaml](compose.yaml); no superponer stacks de ensayo a entornos existentes.
Ante `auth_gssapi_client`, revisar las credenciales de MariaDB, no instalar plugins en Prisma.

## Documentación por feature

- [Índice de features y pendientes](docs/index.md).
- [Flujo SDD y plantilla](docs/sdd/README.md).
- [Memoria de continuidad](MEMORY.md) y [reglas para agentes](AGENTS.md).
- Contrato HTTP: `GET /api/docs/openapi.json`; fuentes en [OpenAPI](backend/src/openapi/).
- Modelo y migraciones: [Prisma](backend/prisma/). No duplicar contratos en documentos grandes.

## Verificación

```bash
npm run docs:check
npm run quality
npm run test:integration
npm run test:e2e
```

Integración requiere MariaDB aislada `_test`/`_ci`. El navegador determinista intercepta API; no sustituye aceptación real.
La [feature de entrega](docs/sdd/entrega/spec.md) describe el gate full-stack y sus restricciones.
Las [colecciones Postman](postman/README.md) usan cuentas sintéticas y claves estables por reintento.

Git Flow: `feature/<feature>` → `develop`; `release/*` y `hotfix/*` hacia la integración correspondiente.
Código implementado no implica autorización de producción, supresión de datos ni aceptación institucional.
