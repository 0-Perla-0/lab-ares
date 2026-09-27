# Pruebas del backend con Postman

Esta carpeta contiene la colección de administración, una colección adicional
de asistencia y un entorno local sin credenciales reales.

## Asistencia

Importa también `Ares-Asistencia.postman_collection.json`. Inicia sesión con
un usuario activo con sede, área y turno activos y conserva la cookie en el
mismo host. Define una `operationKey` nueva por operación y consérvala para
reintentar exactamente el mismo payload; entrada, salida y cierre manual
deben usar claves distintas. La entrada captura `attendanceId` automáticamente.
El cierre manual y la cola requieren coordinador o superior dentro de su
alcance. No ejecutes la colección completa como una secuencia sin ajustar
las claves y el usuario: los recorridos propio y supervisado son independientes.

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
del proxy de Next.js, cambia `baseUrl` a `http://localhost:4321/api` y levanta
el frontend.

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
| POST   | `/api/attendance/check-in`     | Cookie        | Entrada propia idempotente         |
| POST   | `/api/attendance/check-out`    | Cookie        | Salida propia idempotente          |
| GET    | `/api/attendance/me`           | Cookie        | Historial, sesión y bolsa propias  |
| GET    | `/api/attendance/open`         | Cookie        | Sesiones abiertas según alcance    |
| POST   | `/api/attendance/:id/close`    | Cookie        | Cierre manual con motivo           |
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

Asistencia:

```json
{
  "ubicacion": {
    "latitud": 19.4326,
    "longitud": -99.1332,
    "precisionMetros": 12.5
  }
}
```

El cuerpo es opcional, pero check-in y check-out requieren un header
`Idempotency-Key` de 16 a 128 caracteres. La hora siempre proviene del servidor.
La ubicación es consentida y opcional; la respuesta sólo indica si se registró
ubicación/IP, sin devolver sus valores completos.

## Gamificación privada

La carpeta `16 - Gamificación privada` requiere sesión y
`GAMIFICATION_ENABLED=true`; el valor predeterminado es `false`. Configura
`gamificationUserId` con un usuario activo. Las operaciones administrativas
requieren un usuario `ADMIN` y los reconocimientos/reversos usan un
`Idempotency-Key` distinto por operación.

El perfil y el historial sólo son visibles para su propietario o para un
administrador. Los puntos forman un ledger inmutable: una corrección agrega un
reverso negativo y nunca modifica el evento original. No existe ranking
público, moneda, tienda ni premios canjeables.

## Impresión 3D privada

La carpeta `17 - Impresión 3D privada` requiere sesión,
`PRINTING_3D_ENABLED=true` y reiniciar el backend; el valor predeterminado es
`false`. Antes de crear un trabajo, sube un STL con el solicitante y espera a
que pase de cuarentena a `DISPONIBLE`. Copia su identificador a
`printingFileId`, el usuario operador a `printingOperatorId` y deja que las
pruebas guarden `printingJobId` y `printingExecutionId`.

Alterna la sesión por rol: solicitante para crear, consultar y cancelar;
operador o gestor para revisar, asignar y ejecutar. Todas las mutaciones usan
una clave idempotente. Al finalizar una ejecución elige sólo la solicitud
exitosa o la fallida; la fallida habilita el reintento. El flujo no hace
slicing, no controla impresoras, no cotiza, no cobra y no admite 3MF.

## Respuestas y errores

## Auditoría, integridad y operación

La carpeta `19 - Auditoría y operación` usa la misma cookie de sesión. Todos
los usuarios autenticados pueden consultar `/audit/me`; las consultas y
exportaciones administrativas respetan el alcance efectivo `AREA`, `SEDE` o
`GLOBAL`. Las pantallas operativas, jobs, alertas, incidentes y la creación de
manifiestos requieren un permiso global (`JEFE_COORDINADORES` o `ADMIN`).

Configura `auditPeriod` con un día UTC ya cerrado. El manifiesto es inmutable,
se ancla en almacenamiento privado y su verificación detecta alteraciones o
pérdidas; es una comprobación técnica de integridad, no una firma legal. El
worker permanece apagado salvo que se establezca
`AUDIT_MANIFEST_WORKER_ENABLED=true`.

`operationsJobId`, `operationsAlertId` y `operationsIncidentId` identifican
fixtures descartables. El dueño de un lease manual se deriva de la sesión y no
se acepta desde el cuerpo. Los incidentes sólo guardan una referencia al ticket
externo: no sustituyen el sistema de ticketing. Los estados son `ABIERTO`,
`RECONOCIDO`, `INVESTIGANDO`, `MITIGANDO`, `MONITOREANDO`, `RESUELTO` y
`CERRADO`; cambiar estado o severidad exige motivo y responsable. S1 y S2
repetido generan revisión con vencimiento a dos días hábiles.

Las respuestas exitosas del dominio usan `{ "data": ... }`. Los errores usan
principalmente `{ "error": "CODIGO" }`; una validación inválida devuelve además
su detalle estructurado.

| Estado | Significado habitual                                           |
| ------ | -------------------------------------------------------------- |
| 200    | Consulta, actualización o desactivación correcta               |
| 201    | Recurso creado o reactivado                                    |
| 204    | Logout correcto, sin cuerpo                                    |
| 400    | `VALIDATION_ERROR` o horario inválido                          |
| 401    | `UNAUTHORIZED` o credenciales inválidas                        |
| 403    | `FORBIDDEN`, rol o alcance insuficiente                        |
| 404    | Usuario, sede, área o turno inexistente                        |
| 409    | Duplicado, estado incompatible o clave idempotente reutilizada |
| 429    | Demasiados intentos de login                                   |
| 503    | Funcionalidad desactivada mediante feature flag                |

La colección hace borrados lógicos; los registros quedan en la base con
`activa`/`activo` en `false` o, para usuarios, con `estado = BAJA`.

## Retención y supresión

La carpeta `18 - Retención y supresión privada` requiere sesión `ADMIN` para
las operaciones administrativas. `/retention/requests/me` sólo permite al
usuario autenticado crear y consultar sus solicitudes. Define
`retentionSyntheticResourceId` como un recurso descartable de prueba existente
y `retentionSubjectId` como una cuenta de pruebas; no registres recursos de
negocio. Las variables `retentionRuleId`, `retentionRecordId`,
`retentionHoldId`, `retentionRequestId` y `retentionBatchId` se capturan de las
respuestas. Para probar pausa usa un lote separado y asigna su id a
`retentionPauseBatchId`. La petición de creación de hold calcula
automáticamente `reviewAt` a +7 días y `endsAt` a +14 días.

Las escrituras requieren una clave `Idempotency-Key` propia. Las reglas
provisionales son temporales; aprobar reglas no provisionales y ejecutar esas
políticas depende de `RETENTION_INSTITUTIONAL_POLICIES_APPROVED=true`. El worker
de sondeo se inicia apagado con `RETENTION_WORKER_ENABLED=false`; la petición
explícita de ejecución procesa el lote de forma síncrona. Preview sólo crea una
instantánea; autorizar y ejecutar son pasos separados. Ejecutar puede eliminar
o anonimizar los recursos registrados, así que limita la prueba a datos
sintéticos. `Reintentar o reanudar lote` sólo acepta lotes `PAUSADO` o
`FALLIDO`, reinicia sus elementos fallidos y reanuda el procesamiento. El
acuse idempotente incluye `resetFailures`; consulta el detalle del lote para
ver el resultado final. El registry devuelve fingerprints, no identificadores
de negocio.
