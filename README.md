# Ares

Plataforma de Servicio Social, proyectos Kairos y servicios del laboratorio.
Monorepo con Next.js/React en `frontend/` y NestJS/Prisma/MariaDB en `backend/`.

## Inicio local

Usar la versión de Node de [`.nvmrc`](.nvmrc) y npm compatible con el lockfile.

```bash
npm ci
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate:deploy
npm run admin:bootstrap
```

Editar `.env` antes de migrar: configurar una base **local nueva**, `DATABASE_URL` y un `SESSION_SECRET` aleatorio de al menos 32 caracteres.
El bootstrap requiere temporalmente `BOOTSTRAP_ADMIN_CODE`, `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD`; no imprime la contraseña.
No usar la cuenta migradora como runtime productivo; Compose separa migración y permisos por tabla.

En terminales separadas, desde la raíz:

```bash
npm run dev:backend
npm run dev:frontend
```

Frontend: `http://localhost:4321`; backend: `http://localhost:3000`.
El proxy `/api/*` mantiene la cookie HTTP-only bajo el mismo origen. `API_PROXY_TARGET` permite configurar el destino.
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
