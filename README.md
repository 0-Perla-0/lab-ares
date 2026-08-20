# Ares

Monorepo de la plataforma Ares. El frontend y el backend se despliegan como aplicaciones independientes:

- `frontend/`: Astro, React y Tailwind CSS.
- `backend/`: NestJS, Prisma y MariaDB.

## Requisitos

- Node.js 24.19.0
- npm 11.17.0
- MariaDB o MySQL compatible

## Instalación

```bash
npm ci
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run admin:bootstrap
```

Antes de ejecutar Prisma, edita `.env`: `DATABASE_URL` debe contener un usuario y una contraseña reales de MariaDB; `ares_app` y `CHANGE_ME` son marcadores, no credenciales funcionales. También reemplaza `SESSION_SECRET` por una cadena aleatoria de al menos 32 caracteres antes de desplegar. El valor de desarrollo incluido por defecto nunca es aceptado en producción.

Para crear el primer administrador, define temporalmente
`BOOTSTRAP_ADMIN_CODE`, `BOOTSTRAP_ADMIN_EMAIL` y
`BOOTSTRAP_ADMIN_PASSWORD`, y ejecuta `npm run admin:bootstrap`. El comando es
idempotente: no modifica nada cuando ya existe un administrador activo y no
imprime la contraseña.

Una configuración local mínima puede crearse desde una sesión administrativa de MariaDB. Sustituye la contraseña del ejemplo y usa el mismo valor, codificado como URL si contiene caracteres especiales, en `DATABASE_URL`:

```sql
CREATE DATABASE IF NOT EXISTS ares_dev;
CREATE USER IF NOT EXISTS 'ares_app'@'localhost' IDENTIFIED BY 'replace-with-a-local-password';
GRANT ALL PRIVILEGES ON ares_dev.* TO 'ares_app'@'localhost';
```

Puedes validar las credenciales sin incluir la contraseña en el historial de la terminal:

```bash
mariadb --host=localhost --port=3306 --user=ares_app --password ares_dev
```

`npm run prisma:migrate` aplica las migraciones versionadas mediante `prisma migrate deploy`, sin crear una base sombra. Cuando modifiques `backend/prisma/schema.prisma` y necesites generar una migración nueva, usa `npm run prisma:migrate:dev -- --name nombre_de_la_migracion`; ese flujo requiere además los permisos de base sombra descritos por Prisma.

En MariaDB para Windows, `Unknown authentication plugin auth_gssapi_client` normalmente significa que las credenciales de contraseña fallaron y el servidor intentó la autenticación integrada GSSAPI como alternativa. Corrige `DATABASE_URL`; no hace falta instalar un plugin en Prisma.

## Desarrollo

Inicia el backend:

```bash
npm run dev:backend
```

Inicia el frontend en otra terminal:

```bash
npm run dev:frontend
```

Astro escucha normalmente en `http://localhost:4321` y redirige `/api/*` a NestJS en `http://localhost:3000`. Puedes crear `frontend/.env` a partir de `frontend/.env.example` para cambiar `API_PROXY_TARGET` durante desarrollo.

En equipos Windows donde Application Control bloquee el compilador nativo de
Astro, los comandos del frontend instalan automáticamente el fallback WASI
oficial de la misma versión. Es una dependencia local de desarrollo y no
modifica `package.json` ni `package-lock.json`.

### Docker

Con Docker y una `.env` que contenga un `SESSION_SECRET` real:

```bash
docker compose up --build
```

Compose levanta MariaDB, aplica primero las migraciones y después inicia la
imagen de producción del backend. El contenedor expone `http://localhost:3000`.

## Rutas migradas

- `GET /api/health`
- `GET /api/health/live`
- `GET /api/health/ready`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/docs/openapi.json`
- CRUD lógico de `/api/organization/sedes`
- CRUD lógico de `/api/organization/areas`
- CRUD lógico de `/api/organization/turnos`

La autenticación utiliza una cookie HTTP-only y sesiones persistidas en MariaDB. Los permisos se aplican mediante guards de NestJS.

La matriz de autorización está documentada en
[`backend/docs/rbac.md`](backend/docs/rbac.md), y las decisiones de arquitectura
de la fase inicial en
[`backend/docs/phase-0-decisions.md`](backend/docs/phase-0-decisions.md).

## Comprobaciones

```bash
npm run quality
npm run test:integration
```

`quality` comprueba formato, Prisma, pruebas unitarias/E2E aisladas, tipos y
build. `test:integration` usa MariaDB real para comprobar el store de sesiones y
las restricciones de Prisma. CI ejecuta ambos y también construye la imagen del
backend.

Las pruebas del backend viven bajo `backend/test/`: `unit/`, `e2e/` e
`integration/`. El código productivo de `backend/src/` no contiene archivos de
prueba.

## Despliegue

Configura el proxy o balanceador para servir el frontend y enviar todas las rutas `/api/*` al backend NestJS bajo el mismo dominio. Esto mantiene la cookie de sesión como first-party y evita depender de CORS entre dominios.

Aplica las migraciones de `backend/prisma/migrations` antes de iniciar una nueva versión del backend.

## Estrategia de ramas

- `main`
- `develop`
- `feature/*`
- `release/*`
- `hotfix/*`
