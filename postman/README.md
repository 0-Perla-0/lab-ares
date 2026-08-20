# Pruebas del backend con Postman

Esta carpeta contiene una colección ejecutable con todos los endpoints que el
backend expone actualmente y un entorno local sin credenciales reales.

## Preparación

1. Asegúrate de que MariaDB esté disponible y levanta el backend desde la raíz:

   ```powershell
   npm run prisma:migrate:deploy
   npm run dev:backend
   ```

2. En Postman, usa **Import** para importar estos dos archivos:

   - `Ares-Backend.postman_collection.json`
   - `Ares-Local.postman_environment.json`

3. Selecciona el entorno **Ares - Local** y establece `adminEmail` y
   `adminPassword` con las credenciales usadas al ejecutar
   `npm run admin:bootstrap`. El archivo versionado deja la contraseña vacía.

4. Ejecuta la colección completa en orden y sin paralelismo. El login genera
   nombres únicos y las peticiones de creación guardan automáticamente
   `sedeId`, `areaId`, `turnoId` y `userId` como variables de la colección.

Postman conserva automáticamente la cookie HTTP-only `ares-session`. No agregues
un header `Authorization` ni copies la cookie manualmente. Usa siempre el mismo
host (`localhost`); las cookies de `localhost` no se comparten con `127.0.0.1`.

La colección usa directamente `http://localhost:3000/api`. Para probar a través
del proxy de Astro, cambia `baseUrl` a `http://localhost:4321/api` y levanta el
frontend.

## Endpoints disponibles

| Método | Ruta                           | Autenticación | Permiso o comportamiento           |
| ------ | ------------------------------ | ------------- | ---------------------------------- |
| GET    | `/api/health`                  | Pública       | Readiness con base de datos        |
| GET    | `/api/health/live`             | Pública       | Liveness del proceso               |
| GET    | `/api/health/ready`            | Pública       | Readiness con base de datos        |
| GET    | `/api/docs/openapi.json`       | Pública       | Contrato OpenAPI 3.1               |
| POST   | `/api/auth/login`              | Pública       | Crea la sesión; límite de intentos |
| GET    | `/api/auth/me`                 | Cookie        | Usuario autenticado                |
| POST   | `/api/auth/logout`             | Pública       | Destruye la sesión si existe       |
| GET    | `/api/organization/sedes`      | Cookie        | `organization:read`                |
| POST   | `/api/organization/sedes`      | Cookie        | `organization:manage` global       |
| GET    | `/api/organization/sedes/:id`  | Cookie        | `organization:read`                |
| PUT    | `/api/organization/sedes/:id`  | Cookie        | Administración con alcance         |
| DELETE | `/api/organization/sedes/:id`  | Cookie        | Desactivación lógica en cascada    |
| GET    | `/api/organization/areas`      | Cookie        | `organization:read`                |
| POST   | `/api/organization/areas`      | Cookie        | Administración de la sede          |
| GET    | `/api/organization/areas/:id`  | Cookie        | `organization:read`                |
| PUT    | `/api/organization/areas/:id`  | Cookie        | Administración con alcance         |
| DELETE | `/api/organization/areas/:id`  | Cookie        | Desactivación lógica en cascada    |
| GET    | `/api/organization/turnos`     | Cookie        | `organization:read`                |
| POST   | `/api/organization/turnos`     | Cookie        | Administración del área            |
| GET    | `/api/organization/turnos/:id` | Cookie        | `organization:read`                |
| PUT    | `/api/organization/turnos/:id` | Cookie        | Administración con alcance         |
| DELETE | `/api/organization/turnos/:id` | Cookie        | Desactivación lógica               |
| GET    | `/api/users`                   | Cookie        | `users:read` con alcance           |
| POST   | `/api/users`                   | Cookie        | `users:manage` con alcance         |
| GET    | `/api/users/:id`               | Cookie        | `users:read` con alcance           |
| PUT    | `/api/users/:id`               | Cookie        | `users:manage` con alcance         |
| DELETE | `/api/users/:id`               | Cookie        | Baja lógica (`estado = BAJA`)      |

Todos los roles activos pueden leer los catálogos de organización. `ADMIN` tiene
alcance global; `JEFE_SEDE` solo administra su sede y su jerarquía. La colección
requiere `ADMIN` porque también prueba la creación de una sede.

En usuarios, `COORDINADOR` y `JEFE_AREA` operan dentro de su área,
`JEFE_SEDE` dentro de su sede y `JEFE_COORDINADORES`/`ADMIN` globalmente. Un
usuario no puede asignar un rol superior al suyo ni darse de baja a sí mismo.

## Cuerpos principales

Login:

```json
{
  "email": "admin@ares.local",
  "password": "tu-password"
}
```

Sede:

```json
{
  "nombre": "Sede Centro",
  "direccion": "Av. Principal 100"
}
```

`direccion` puede omitirse o enviarse como `null`. `nombre` acepta hasta 150
caracteres y `direccion` hasta 255.

Área:

```json
{
  "nombre": "Desarrollo",
  "sedeId": 1
}
```

Turno:

```json
{
  "nombre": "Matutino",
  "areaId": 1,
  "horaInicio": "08:00",
  "horaFin": "14:00",
  "dias": ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES"]
}
```

Los días válidos son `LUNES`, `MARTES`, `MIERCOLES`, `JUEVES`, `VIERNES`,
`SABADO` y `DOMINGO`, sin duplicados. Las horas usan formato `HH:MM` de 24 horas
y el inicio debe ser menor que el fin. Los tres `PUT` aceptan cuerpos parciales,
pero no un objeto vacío.

Usuario:

```json
{
  "codigo": "USR001",
  "email": "usuario@ares.local",
  "password": "una-password-segura",
  "rol": "PRESTADOR",
  "estado": "ACTIVO",
  "sedeId": 1,
  "areaId": 1,
  "turnoId": 1
}
```

`password` debe tener entre 12 y 128 caracteres y no superar 72 bytes UTF-8,
el límite de bcrypt. `rol` usa `PRESTADOR` por defecto y `estado` usa
`PENDIENTE`; las tres asignaciones son opcionales y aceptan `null`, pero deben
pertenecer a la misma jerarquía. El `PUT` es parcial y `DELETE` conserva el
registro con estado `BAJA`. Ninguna respuesta incluye `password` o
`passwordHash`.

## Respuestas y errores

Las respuestas exitosas del dominio usan `{ "data": ... }`. Los errores usan
principalmente `{ "error": "CODIGO" }`; una validación inválida devuelve además
su detalle estructurado.

| Estado | Significado habitual                             |
| ------ | ------------------------------------------------ |
| 200    | Consulta, actualización o desactivación correcta |
| 201    | Recurso creado o reactivado                      |
| 204    | Logout correcto, sin cuerpo                      |
| 400    | `VALIDATION_ERROR` o horario inválido            |
| 401    | `UNAUTHORIZED` o credenciales inválidas          |
| 403    | `FORBIDDEN`, rol o alcance insuficiente          |
| 404    | Usuario, sede, área o turno inexistente          |
| 409    | Nombre duplicado o padre inactivo                |
| 429    | Demasiados intentos de login                     |

La colección hace borrados lógicos; los registros quedan en la base con
`activa`/`activo` en `false` o, para usuarios, con `estado = BAJA`.
