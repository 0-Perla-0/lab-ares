# Contexto, estado de desarrollo y plan de trabajo de Ares

## Ficha de corte

| Dato                        | Valor                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Fecha de revisión           | 25 de agosto de 2026                                                                                              |
| Rama de trabajo             | `codex/backend-attendance-core`                                                                                   |
| Commit base revisado        | `53c3e88` (`develop`); corte de asistencia aún en el worktree                                                     |
| Sistema actual              | Monorepo con Next.js App Router, NestJS, Prisma y MariaDB                                                         |
| Fuentes funcionales         | Cinco PDF del sistema heredado: plan, análisis integral, reporte de estado, documento técnico y manual de usuario |
| Evidencia de implementación | Código, esquema Prisma, migraciones, OpenAPI, pruebas, CI, Docker y Postman del repositorio actual                |

## 1. Alcance y criterio de comparación

Este documento separa cinco capas de evidencia que no deben confundirse:

1. **El sistema heredado GestionSS-Ares.** El PDF de 132 páginas describe el monolito anterior, sus módulos, rutas, modelos, flujos y deuda técnica. Sirve como inventario y referencia de negocio, no como descripción del código actual.
2. **El plan de migración.** `Docs-Ares.pdf` clasifica qué capacidades se pretendía migrar, revisar, posponer o eliminar. Sus decisiones son insumos de planeación y no sustituyen la aceptación actual de producto.
3. **El reporte de estado de enero de 2026.** `REPORTE TÉCNICO ESTADO INTEGRAL DEL SISTEMA ARES.pdf` relata el avance declarado del sitio viejo, su entorno local/staging y una hoja de ruta con fecha ya vencida. Sus porcentajes pertenecen al legado.
4. **El documento técnico y el manual de marzo de 2026.** Describen el alcance que el equipo anterior consideró entregado y los recorridos operativos esperados por rol. Son la fuente más concreta para recuperar contratos de negocio, pero contienen contradicciones y pendientes propios.
5. **La implementación vigente.** El repositorio actual es una reconstrucción separada en frontend y backend. Sólo se marca una funcionalidad como implementada cuando existe evidencia en el código actual.

Las instrucciones o recomendaciones contenidas en los PDF se trataron como material de referencia. La solicitud actual de generar contexto, comparar brechas y repartir el trabajo es la que gobierna este entregable.

## 2. Resumen ejecutivo

Ares ya cuenta con una base administrativa sólida y verificable, pero todavía no es funcionalmente equivalente al sistema documentado. El desarrollo actual cubre infraestructura, autenticación con sesiones, autorización centralizada, usuarios, catálogos de organización y el primer corte backend de asistencia propia. Servicio Social sigue incompleto porque faltan corte omitido, corrección, bolsa, validación, ausencias, calendario, documentos y su UI; **Kairos** aún no inicia.

El siguiente objetivo no debería ser migrar pantallas aisladas. Debe construirse primero un recorrido vertical completo de Servicio Social:

`check-in -> check-out -> bolsa de horas -> validación -> faltas/calendario -> documentos`

Después puede abordarse Kairos en este orden:

`proyecto -> miembros -> actividades -> evidencia -> validación -> Kanban`

El cierre funcional incorpora versiones pequeñas pero completas de gamificación, impresión 3D, inventario y visitas porque deben estar presentes en Ares. Tienda/recompensas, capacitación RV y subtareas avanzadas continúan fuera del alcance inicial; los catálogos académicos se limitan a la procedencia aprobada en 19B.

No se asigna un porcentaje global de avance porque daría el mismo peso a una pantalla de catálogo que al flujo completo de asistencia. La lectura correcta es:

- **Base técnica y administración inicial:** implementadas.
- **Operación de Servicio Social:** parcial; backend de check-in/check-out y consulta propia implementado, resto del recorrido pendiente.
- **Kairos:** pendiente.
- **Funciones secundarias requeridas:** pendientes de desarrollo con un MVP obligatorio ya delimitado.

### 2.1 Qué aporta la documentación encontrada

| Fuente heredada                        | Aporte útil para la reconstrucción                                                                                                                                                                                      | Limitación que debe conservarse visible                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reporte técnico, 14 de enero de 2026   | Afirma que el sitio viejo tenía asistencia, validación masiva, bolsa de horas, documentos, XP, ranking, impresión 3D y visitas; identifica como pendientes Kanban, cron de faltas, monitoreo en vivo, tienda y reportes | El 70% declarado y la fecha objetivo del 1 de marzo de 2026 no representan el avance actual; el entorno descrito no era producción                         |
| Documento técnico, 11 de marzo de 2026 | Detalla autenticación, activación, asistencia, faltas, calendario, documentos, Kairos, gamificación, auditoría, aproximadamente 103 archivos de ruta API y cinco pendientes concretos                                   | Declara el legado como funcional y entregado, pero también reconoce funcionalidades incompletas, riesgos y decisiones de despliegue/migraciones sin cerrar |
| Manual de usuario, 11 de marzo de 2026 | Define capacidades por rol, operación diaria, estados de documentos, validación, cierre manual de sesiones, roles internos y carriles de Kairos                                                                         | Describe el comportamiento esperado, no demuestra que cada recorrido fuera correcto ni que deba migrarse sin aceptación de producto                        |

La nueva evidencia confirma que el sitio viejo llegó mucho más lejos funcionalmente que la reconstrucción actual. Esto **aumenta la precisión del alcance faltante**, pero no aumenta el avance del repositorio nuevo.

### 2.2 Contradicciones relevantes del legado

- El reporte de enero marca el Kanban como pendiente; el manual de marzo ya explica cómo operarlo.
- El reporte de enero presenta visitas como operativo; el documento técnico de marzo todavía identifica el endpoint de registro y el sistema de visitas como pendientes.
- El cron de faltas aparece pendiente en enero; en marzo se declara cálculo/cierre automático, pero aún faltaba una notificación real de aviso de cierre.
- El sistema se describe primero como local con previews de staging y sin producción; los documentos posteriores no aportan evidencia verificable de un entorno productivo estable.
- El análisis integral previo detectó duplicados, modelos huérfanos, permisos incompletos y pruebas inefectivas, por lo que una afirmación de “entregado” no equivale a un recorrido confiable.

Ante estas contradicciones, el manual se usa para proponer contratos funcionales y el código nuevo sigue siendo la única fuente para declarar avance actual.

> **Límite de migración:** el reporte de enero contiene credenciales y contraseñas en texto claro. No se reproducen ni se migrarán. Como la reconstrucción vive en un repositorio nuevo, no se incluye una auditoría del historial Git heredado; las cuentas nuevas se activarán mediante invitaciones propias de esta plataforma.

## 3. Qué se ha desarrollado

### 3.1 Arquitectura e infraestructura

| Capacidad                   | Estado comprobado                   | Evidencia actual                                                                              |
| --------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Separación frontend/backend | Implementada                        | `frontend/` es Next.js y `backend/` es NestJS; `/api/*` se reescribe al backend.              |
| Persistencia                | Implementada                        | Prisma 7 con MariaDB/MySQL y dos migraciones versionadas.                                     |
| Contenedores                | Implementada                        | Dockerfiles independientes y `compose.yaml` con base de datos, migración, backend y frontend. |
| Configuración               | Implementada                        | Validación de entorno, zona horaria, secretos y orígenes.                                     |
| CI                          | Implementada                        | GitHub Actions instala, migra, ejecuta calidad e integración y construye ambos contenedores.  |
| Contrato HTTP               | Implementado para el alcance actual | OpenAPI 3.1 disponible en `/api/docs/openapi.json`.                                           |
| Colección de API            | Implementada para el alcance actual | Colección y ambiente Postman versionados en `postman/`.                                       |

### 3.2 Autenticación y autorización

- Login, logout y consulta de sesión actual.
- Cookie de sesión HTTP-only con sesiones persistidas en MariaDB.
- Regeneración de sesión al iniciar sesión y destrucción al salir.
- Contraseñas con `bcryptjs` y validaciones de longitud.
- Límite de intentos de login.
- Guards globales de autenticación y permisos en NestJS.
- Matriz RBAC centralizada con alcances `self`, `area`, `sede` y `global`.
- Seis roles coherentes entre Prisma, backend y frontend: prestador, coordinador, jefe de área, jefe de sede, jefe de coordinadores y administrador.
- El backend conserva la autoridad final; la visibilidad de controles en frontend es sólo una ayuda de interfaz.

### 3.3 Usuarios y organización

- Listado, creación, consulta, edición y baja lógica de usuarios.
- Estados de usuario: activo, pendiente, inactivo, liberado y baja.
- Restricciones de alcance por rol y jerarquía.
- Prevención de autoeliminación.
- Catálogos y mantenimiento de sedes, áreas y turnos.
- Desactivación lógica de catálogos.
- Días y horario por turno.
- Validaciones de pertenencia entre sede, área, turno y usuario.
- Alta idempotente del primer administrador mediante script de bootstrap.

### 3.4 Primer corte backend de asistencia

- Check-in y check-out propios con hora del servidor y `Idempotency-Key` obligatorio.
- Restricción transaccional y de base de datos para conservar una sola sesión abierta por usuario.
- Consulta de sesión actual e historial propio de hasta 50 registros.
- Semáforo de duración v1 con versión y códigos de motivo persistidos; riesgo separado de validación.
- Captura opcional de coordenadas consentidas e IP observada por el servidor; la respuesta ordinaria sólo expone indicadores de presencia.
- Registro idempotente y evento de auditoría en la misma transacción que la asistencia.
- Contrato de estados, transiciones futuras, errores y separación corrección/validación en `backend/docs/attendance-contract.md`.

Todavía no están implementados el corte de las 23:59, la corrección autorizada, las consultas jerárquicas, la validación, la bolsa de horas ni la evaluación contra perímetros/redes configurables.

### 3.5 Frontend disponible

El frontend contiene nueve rutas de página:

- Sitio público institucional.
- Login.
- Resumen protegido.
- Sedes.
- Áreas.
- Turnos.
- Listado de usuarios.
- Alta de usuario.
- Edición de usuario.

Las pantallas incluyen navegación adaptable, estados de carga y error, confirmación de bajas y visibilidad de acciones basada en rol.

### 3.6 Backend y calidad

El backend expone 31 operaciones HTTP si se cuentan salud, autenticación, OpenAPI, organización, usuarios y las cuatro operaciones propias de asistencia. El esquema actual contiene nueve modelos Prisma; a los seis iniciales se añadieron `Asistencia`, `OperacionIdempotenteAsistencia` y `EventoAuditoria`.

En esta revisión se ejecutó la suite no integrada del backend:

- 23 archivos de prueba aprobados.
- 173 pruebas aprobadas.
- Cobertura funcional de autenticación, permisos, sesiones, usuarios, organización, asistencia, OpenAPI, configuración, salud y bootstrap.

La suite de integración con MariaDB aprueba tres pruebas, incluida la repetición concurrente de check-in/check-out y las restricciones reales de idempotencia/sesión abierta. El frontend todavía no tiene pruebas automatizadas propias; sólo cuenta con validación de tipos, formato y build dentro del flujo de calidad.

### 3.7 Diferencia entre el sitio viejo y la reconstrucción

| Aspecto          | Sitio viejo documentado                                                                                                           | Reconstrucción actual                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Arquitectura     | Next.js 15 monolítico: páginas, endpoints y dominio en el mismo proyecto                                                          | Next.js 16 para UI y NestJS 11 como backend independiente                                                                            |
| Autenticación    | NextAuth 5 con JWT, middleware y verificaciones distribuidas                                                                      | Sesión persistente server-side, cookie HTTP-only y guards globales NestJS                                                            |
| Acceso a datos   | Prisma 6 desde rutas y utilidades del monolito                                                                                    | Prisma 7 encapsulado en repositorios/servicios del backend                                                                           |
| Alcance de datos | Decenas de modelos para asistencia, documentos, Kairos, gamificación, laboratorio y contenido                                     | Seis modelos para organización, usuarios y sesiones; los demás dominios aún no existen                                               |
| API              | Aproximadamente 103 archivos `route.ts` reportados, con duplicados y endpoints sin consumidor detectados por el análisis integral | 27 operaciones HTTP intencionales y documentadas en OpenAPI para el alcance actual                                                   |
| Calidad          | El documento de marzo menciona Jest/ESLint; el análisis integral encontró pruebas y CI inefectivos                                | Vitest, pruebas unitarias/E2E/integración, typecheck, build y CI                                                                     |
| Despliegue       | Desarrollo local y previews de Vercel; sin evidencia consistente de producción estable                                            | Docker/CI reproducibles; modelo administrado y liberación por anillos aprobados, todavía sin proveedor, entornos ni piloto ejecutado |

La estrategia correcta es reconstruir contratos de negocio sobre esta arquitectura, no copiar rutas, modelos ni middleware del monolito.

## 4. Deuda heredada que la reconstrucción ya atiende

| Hallazgo del sistema heredado                                        | Situación en la reconstrucción                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monolito con UI, dominio y acceso a datos mezclados                  | Corregido estructuralmente mediante Next.js y NestJS independientes.                                                                                                                                                                |
| Autorización dispersa y sólo del lado cliente en algunos módulos     | Corregido para el alcance actual con guards, permisos y políticas backend. Debe conservarse al añadir cada módulo nuevo.                                                                                                            |
| Roles escritos con nombres inconsistentes                            | Corregido en los seis roles actuales mediante enums y tipos compartidos conceptualmente.                                                                                                                                            |
| Falta de historial confiable de migraciones                          | Corregido para el nuevo esquema con migraciones Prisma versionadas.                                                                                                                                                                 |
| Ausencia efectiva de pruebas y CI                                    | Corregido en backend; queda una brecha clara de pruebas frontend.                                                                                                                                                                   |
| Rutas, modelos y páginas duplicadas                                  | No se trasladaron a la nueva base. Las funcionalidades deben reconstruirse desde el contrato de negocio, no copiarse.                                                                                                               |
| API de Kairos sin autorización del servidor                          | No existe aún en el nuevo backend. Su futura implementación deberá nacer con permisos y alcance server-side.                                                                                                                        |
| Secretos y credenciales expuestos en historial/documentos del legado | La configuración actual usa variables y rechaza secretos inseguros en producción. Los valores publicados en los PDF deben considerarse comprometidos y rotarse; la limpieza de historial y accesos requiere una auditoría separada. |

## 5. Comparación funcional y brechas

### Leyenda

- **Implementado:** el recorrido principal existe en frontend y backend.
- **Parcial:** existe una base útil, pero faltan operaciones o recorridos del alcance documentado.
- **Pendiente:** no existe implementación funcional en el repositorio actual.
- **Decisión requerida:** no debe desarrollarse hasta que producto confirme comportamiento o permanencia.
- **Pospuesto:** el plan de migración indicó backlog, feature nueva o no migrar.

| Dominio o módulo                | Expectativa recuperada del legado                                                           | Estado actual                                            | Falta principal                                                                                                                                     | Prioridad recomendada |
| ------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Infraestructura base            | Aplicaciones desplegables, base persistente, variables seguras y CI                         | Implementado en local/CI; objetivo aprobado              | Mantener despliegue portable, respaldos y observabilidad; el aprovisionamiento externo no forma parte de las decisiones funcionales del repositorio | Mantenimiento         |
| Autenticación                   | Login, registro opcional, activación administrativa, perfil, foto y preferencias            | Parcial; contratos de acceso, MFA y contraseña aprobados | Implementar tokens, sesiones, TOTP opcional, lista de contraseñas bloqueadas y transición de bcrypt a Argon2id                                      | P1                    |
| Roles y permisos                | Seis roles de plataforma y permisos por operación/alcance                                   | Implementado para módulos actuales                       | Extender permisos por dominio, incluyendo cierre manual, validaciones masivas, auditoría y Kairos                                                   | P0 transversal        |
| Usuarios                        | CRUD, aprobación, estados, baja segura y cambios sensibles auditados                        | Parcial avanzado                                         | Flujo de activación/rechazo, historial de email/rol/credenciales, perfil académico y filtros/paginación                                             | P1                    |
| Sedes, áreas, turnos y academia | Organización operativa más procedencia académica del prestador                              | Organización operativa implementada; academia pendiente  | Mantener permisos por sede/área y añadir institución, unidad académica, programa, cohorte y adscripción histórica como dimensión independiente      | P1                    |
| Auditoría transversal           | Quién cambió, aprobó o rechazó qué y cuándo                                                 | Parcial; base append-only usada por check-in/check-out   | Ampliar catálogo, hashes/manifiestos de integridad, consulta por alcance y retención; integrar los demás dominios                                   | P0                    |
| Conservación y supresión        | Conservar historial necesario sin retener indefinidamente datos personales temporales       | Pendiente; matriz configurable aprobada                  | Categorías/versiones, bloqueo, retención legal, supresión/anonimización, jobs, solicitudes y compatibilidad con respaldos                           | P0 transversal        |
| Check-in/check-out              | Una sesión abierta, cierre propio, cierre manual autorizado y alertas de sesiones anormales | Backend propio parcial implementado                      | UI, corte omitido, corrección autorizada, consulta jerárquica, política por sede y alertas                                                          | P0                    |
| Bolsa de horas y riesgo         | Horas autorizadas, pendientes y rechazadas; semáforo verde/amarillo/rojo                    | Riesgo de duración v1 implementado; bolsa pendiente      | Evaluar ubicación/red versionadas, saldo, comentarios del validador e historial inmutable                                                          | P0                    |
| Validación de horas             | Revisión individual y masiva, filtros por sede/área/usuario/estado y rechazo comentado      | Pendiente; contrato jerárquico aprobado                  | Implementar separación de funciones, alcance organizacional y lotes verdes de máximo 100 registros                                                  | P0                    |
| Faltas                          | Cálculo por ausencia, consulta, justificación con soporte y resolución                      | Pendiente                                                | Generación, adjuntos, revisión, estados y relación con asistencia/calendario                                                                        | P0                    |
| Calendario y excepciones        | Festivos, vacaciones, suspensiones y posibles ajustes manuales de horas                     | Pendiente                                                | Catálogo, reglas de exclusión, permisos y decisión sobre regalos/ajustes manuales                                                                   | P0                    |
| Jobs de cierre, faltas y avisos | Cierre automático, aviso de cierre y cálculo diario de faltas                               | Pendiente                                                | Scheduler real, idempotencia, bloqueo, reintentos, notificaciones efectivas, métricas y logs                                                        | P0                    |
| Documentos del prestador        | Carga y revisión con estados `PENDIENTE -> EN_REVISION -> AUTORIZADO/RECHAZADO`             | Pendiente; contrato documental y análisis aprobados      | S3/MinIO, requisitos/versiones, retroalimentación, cuarentena, scanner asíncrono y descargas privadas                                               | P1                    |
| Documentación de coordinadores  | Sustituir directorios, manuales y bitácoras operadas en Excel                               | Pendiente; biblioteca operativa aprobada                 | Implementar documentos versionados por alcance; mantener directorios y bitácoras consultables como datos estructurados, no como hojas sustitutas    | P2                    |
| Kairos - proyectos              | Nombre, descripción, prioridad, estado, miembros, favoritos y reportes                      | Pendiente                                                | Modelo canónico, API autorizada, pantallas y alcance por proyecto                                                                                   | P1                    |
| Kairos - miembros               | Roles `DUEÑO`, `SUBLÍDER`, `COLABORADOR` y `OBSERVADOR`                                     | Pendiente                                                | Invitación/asignación, matriz de acciones y compatibilidad con roles globales                                                                       | P1                    |
| Kairos - actividades            | Título, descripción, fechas, complejidad, asignados, estado, duplicado y movimiento         | Pendiente                                                | CRUD, transiciones, reasignación, trazabilidad al mover entre proyectos y validación                                                                | P1                    |
| Evidencias Kairos               | Archivos y comentarios con revisión e historial                                             | Pendiente                                                | Almacenamiento, autorización, versión, retroalimentación y vínculo inequívoco con actividad                                                         | P1                    |
| Kairos - Kanban                 | Carriles `PENDIENTES -> REVISADOS -> EN_PROCESO -> TERMINADO`                               | Pendiente                                                | Confirmar esos estados, reglas de movimiento y evidencia mínima; construir sobre actividades estables                                               | P2                    |
| Gamificación y XP               | XP base por calidad, nivel, racha, monedas y progreso                                       | Pendiente; MVP obligatorio aprobado                      | Puntos privados por actividades Kairos aprobadas, nivel derivado, insignias limitadas y libro de eventos; asistencia no otorga XP                   | P3                    |
| Insignias y ranking             | Logros, medallas y clasificación                                                            | Pendiente; sólo insignias en MVP                         | Catálogo y otorgamiento auditable de insignias; no habrá ranking público inicial                                                                    | P3                    |
| Tienda y recompensas            | Canje de monedas, catálogo, stock y carrito                                                 | Fuera del MVP                                            | No implementar monedas, carrito, stock de recompensas ni canje en el cierre actual                                                                  | Backlog posterior     |
| Monitoreo y reportes            | Pendientes por módulo, sesiones abiertas, ocupación, tiempos de validación y Excel/CSV      | Pendiente; alcance aprobado                              | Tableros por alcance, refresco de 60 segundos, CSV controlado y exportación asíncrona para más de 5,000 filas                                       | P1/P2                 |
| Directorio público              | Consulta de contactos autorizados                                                           | Sustituido por directorio interno                        | Implementar visibilidad por área/proyecto y preferencias; un directorio público requeriría contrato separado                                        | P2                    |
| Sitio público                   | Landing, FAQ, contacto y contenido institucional                                            | Parcial; alcance público limitado aprobado               | Completar páginas institucionales y contenido versionado, sin directorio público, autorregistro, datos personales ni formularios anónimos iniciales | P3                    |
| Solicitud de impresión 3D       | Solicitud y seguimiento                                                                     | Pendiente; MVP obligatorio aprobado                      | Implementar `TrabajoImpresion3D` canónico, archivo STL privado, estados, asignación y resolución                                                    | P3                    |
| Bitácora de impresión 3D        | Tiempo, peso, material y archivo STL                                                        | Pendiente; ejecución mínima aprobada                     | Registrar intentos/ejecuciones separados con inicio, fin, material, peso opcional, resultado y observación                                          | P3                    |
| Inventario                      | Catálogo del laboratorio                                                                    | Pendiente; MVP obligatorio aprobado                      | Separar consumibles y activos; ubicaciones, movimientos auditables y préstamos/devoluciones sin compras, contabilidad o ERP                         | P3                    |
| Visitas                         | Registro público, aprobación y control de entrada/salida                                    | Pendiente; MVP obligatorio aprobado                      | Invitación interna privada y temporal, QR opaco y confirmación de entrada/salida por personal autorizado; sin solicitud pública                     | P3                    |
| Subtareas y comentarios Kairos  | Desglose, menciones y colaboración                                                          | Pospuesto                                                | Existían modelos o intención, sin recorrido confiable confirmado                                                                                    | Backlog               |
| Capacitación RV                 | Contenido de capacitación                                                                   | Pospuesto                                                | No se detectó uso; confirmar antes de diseñar                                                                                                       | Backlog               |
| Modelos legacy duplicados       | Mantener variantes históricas                                                               | No migrar                                                | Diseñar modelos canónicos en el nuevo dominio                                                                                                       | Fuera de alcance      |

### 5.1 Contratos funcionales consolidados

Estos contratos recuperados ya incorporan las decisiones aprobadas de la sección 11. Si una descripción heredada los contradice, prevalece este documento:

**Asistencia y validación**

- El prestador no puede iniciar una segunda sesión mientras exista una abierta.
- El cierre normal muestra duración y estado de horas; una sesión abierta se corta después de las 23:59 como `CHECKOUT_OMITIDO` y no suma horas hasta ser revisada.
- Una persona autorizada puede corregir o cerrar una sesión anormal y debe registrar una observación; quien corrige no emite su validación final.
- Los validadores filtran por sede, área, usuario y estado; aprobar/rechazar exige revisar check-in, check-out y duración.
- La aprobación masiva sólo procede para sesiones verdes y lotes de máximo 100; amarillo y rojo requieren acción individual.
- La bolsa distingue horas pendientes, autorizadas y rechazadas, y conserva comentarios del validador.

**Faltas, calendario y documentos**

- Una ausencia inicia pendiente de justificación, admite texto y soporte privado, aplica los plazos de 5/2/3 días hábiles y muestra el resultado de revisión o apelación.
- Festivos, vacaciones, suspensiones, permisos y horarios especiales excluyen o modifican el cálculo mediante excepciones jerárquicas y auditables.
- Los documentos mantienen requisitos y versiones inmutables y siguen los estados detallados en 6B; un rechazo o solicitud de corrección incluye retroalimentación.

**Kairos**

- Los roles internos son `PROPIETARIO`, `SUBLIDER`, `COLABORADOR` y `OBSERVADOR`; no sustituyen el rol global del usuario.
- Una actividad contiene título, descripción, fechas, prioridad, complejidad, un responsable principal y participantes.
- Los estados son `PENDIENTE`, `EN_PROGRESO`, `BLOQUEADA`, `EN_REVISION`, `REQUIERE_CORRECCION`, `TERMINADA` y `CANCELADA`; “vencida” es una condición derivada.
- Las transiciones pasan por reglas de dominio, requieren autorización y conservan historial; reabrir exige un motivo.
- Cada entrega genera evidencia inmutable con comentario contextual y debe revisarla una persona distinta del responsable.

## 6. Funcionalidades faltantes por prioridad

### P0 - completar el núcleo de Servicio Social

1. Completar la traducción de 2A–5.2B y 17B: asistencia/riesgo ya tiene contrato; faltan política versionada por sede, validación, ausencias y calendario.
2. Completar los modelos: asistencia, idempotencia y auditoría base ya tienen migración; faltan autorizaciones, bolsa, ausencias y excepciones de calendario.
3. Completar el corte operativo: check-in/check-out transaccionales con hora de servidor ya están implementados; faltan corte automático y corrección auditada.
4. Completar consultas: sesión actual e historial propio ya están implementados; faltan consulta jerárquica y detección de sesiones anormales.
5. Implementar validación individual y aprobación masiva verde con alcance jerárquico y límite de lote.
6. Implementar ausencias provisionales, justificaciones, aclaraciones, apelación y soportes privados.
7. Implementar jobs de corte, ausencias y avisos con bloqueo, reintentos, idempotencia, notificaciones y observabilidad.
8. Ampliar la auditoría append-only ya transaccional en check-in/check-out con catálogo común, hashes/manifiestos y cobertura de los demás cambios sensibles.
9. Implementar invitaciones de cuenta y notificaciones internas/transaccionales como capacidades transversales.
10. Clasificar los datos nuevos para retención y evitar borrado automático de negocio hasta cargar la matriz institucional aprobada.
11. Mantener OpenAPI, Postman y pruebas por recorrido; asistencia propia ya está cubierta y faltan los cortes siguientes.
12. Incorporar feature flags con aplicación server-side por entorno, sede, área, usuario y función para operar el piloto progresivo.
13. Asignar responsables funcional, operativo, técnico, de liberación y de datos/archivo antes del Anillo 1; ninguna ausencia de respuesta equivale a aprobación.
14. Habilitar un canal único de soporte, catálogo de severidades, guardia primaria/secundaria y runbooks de diagnóstico, mitigación, comunicación y cierre para incidentes S1/S2 antes del Anillo 1.
15. Implementar y ensayar la estrategia 29B: recuperación punto en el tiempo para datos críticos, restauración coordinada de base/objetos, modos degradados seguros y captura auditada de contingencias.
16. Tratar WCAG 2.2 AA como criterio transversal de terminado, combinando lint/pruebas automáticas con teclado, foco, zoom/reflujo y evaluación manual con tecnologías de asistencia.
17. Aplicar la matriz 30.1B: navegadores modernos de escritorio/móvil, UI de 320 px en adelante, operaciones idempotentes ante respuestas inciertas y pruebas de desconexión/reintento sin check-in offline.

### P1 - documentos, perfil académico y Kairos esencial

1. Crear una abstracción S3-compatible, usar MinIO en local e implementar cuarentena y análisis antimalware asíncrono antes de disponibilizar archivos.
2. Implementar requisitos, versiones, subida, descarga, revisión, retroalimentación y autorización documental con los estados aprobados.
3. Implementar proyectos Kairos y miembros con roles internos separados del rol global y autorización server-side.
4. Implementar actividades, asignaciones, transiciones controladas y entregas/evidencias trazables.
5. Agregar paginación y filtros a listados que puedan crecer.
6. Incorporar pruebas automatizadas frontend para los recorridos críticos.
7. Añadir catálogos académicos y adscripción histórica del prestador sin incorporarlos al cálculo de permisos.
8. Implementar recuperación de acceso, revocación/listado de sesiones y recuperación administrativa auditada.
9. Ofrecer TOTP y códigos de recuperación como MFA opcional para cualquier rol, sin bloquear funciones por no activarlo.
10. Aplicar la política moderna de contraseñas y migrar hashes bcrypt a Argon2id al autenticar/restablecer cuando existan usuarios previos.

### P2 - experiencia operativa y módulos de apoyo

1. Kanban de Kairos como representación visual de las transiciones aprobadas, una vez estabilizado el dominio.
2. Tableros operativos y exportaciones CSV con alcance, límites y procesamiento asíncrono aprobados.
3. Biblioteca operativa versionada y directorio interno con reglas explícitas de alcance y privacidad.
4. Consulta administrativa de auditoría con filtros por alcance, correlación, actor, objeto y resultado.

### P3 - módulos mínimos requeridos

- Gamificación privada con puntos/nivel derivados, insignias y eventos reversibles a partir de actividades Kairos aprobadas; sin puntos por asistencia, ranking público, monedas o tienda.
- Inventario de consumibles/activos con ubicaciones, movimientos, existencias y préstamos/devoluciones; sin compras, costos, contabilidad o ERP.
- Visitas por invitación interna temporal con QR opaco y confirmación de entrada/salida por personal autorizado; sin solicitud pública ni cuenta de visitante.
- Impresión 3D con solicitud, archivo STL privado analizado, asignación a operador, estados y ejecuciones básicas; sin control de impresora, laminado, cobro o comercio electrónico.

### Backlog posterior no comprometido

- Ranking público, monedas, tienda y recompensas de gamificación.
- Subtareas y comentarios Kairos.
- Capacitación RV.

## 7. Secuencia recomendada de entrega

### Incremento 0 - decisiones y contratos

- Mantener el registro de decisiones 1B–30.1B y 31 como fuente funcional cerrada para esta fase.
- No abrir decisiones sobre proveedor, presupuesto, responsables institucionales, plazos externos o fuentes que el equipo no controla; se gestionarán fuera de este documento cuando existan.
- Formalizar estados y transiciones de asistencia, documentos y Kairos a partir de los contratos aprobados.
- Ampliar la matriz de permisos y preparar modelos, contratos OpenAPI y criterios de aceptación antes de construir UI.

### Incremento 1 - asistencia vertical

- Check-in/check-out. **Backend implementado; UI pendiente.**
- Cierre manual auditado y alertas de sesiones anormales.
- Consulta de asistencia propia. **Backend implementado; UI pendiente.**
- Bolsa de horas.
- Pruebas de idempotencia, concurrencia y turnos. **Base backend implementada; falta alcance jerárquico.**

### Incremento 2 - validación, ausencias, documentos y perfil académico

- Bandejas de validación.
- Calendario y excepciones.
- Ausencias provisionales, justificaciones, apelaciones y scheduler de corte/aviso/cálculo.
- Carga en cuarentena, análisis automático y revisión documental con estados y retroalimentación.
- Catálogos académicos y adscripción histórica del prestador, sin efectos sobre permisos.

### Incremento 3 - Kairos base

- Proyectos y miembros con roles internos.
- Actividades, responsable principal, participantes y transiciones controladas.
- Entrega, comentarios y revisión trazable de evidencias.

### Incremento 4 - Kairos visual y experiencia operativa

- Kanban que invoque las transiciones de actividad aceptadas.
- Tableros, reportes/exportaciones y directorio interno.
- Sitio institucional público limitado con contenido administrable y versionado.

### Incremento 5 - módulos mínimos requeridos

- Visitas por invitación interna y control de entrada/salida.
- Inventario de consumibles/activos, movimientos y préstamos.
- Gamificación privada mínima sobre actividades Kairos aprobadas.
- Solicitudes y ejecuciones básicas de impresión 3D con archivos privados.

### Liberación progresiva de los incrementos

- Anillo 0 valida en staging con equipo, responsables operativos y cuentas ficticias.
- Anillo 1 habilita Servicio Social completo para una sede/área y 10–25 prestadores durante al menos cuatro semanas o 20 días hábiles.
- Anillo 2 amplía primero dentro de la sede y después a sedes adicionales, incorporando expediente, perfil, tableros, exportaciones y directorio.
- Anillo 3 ejecuta un piloto independiente de Kairos básico con pocos proyectos y responsables definidos.
- Anillo 4 habilita por separado los MVP de visitas, inventario, gamificación e impresión 3D una vez estables sus dependencias; un problema en ellos no detiene Servicio Social.
- Cada avance exige criterios de salud, conciliación, soporte y decisión explícita; deshabilitar una función no elimina los registros creados.

Cada incremento debe cerrar frontend, backend, migración, permisos, OpenAPI, pruebas y observabilidad básica. No se recomienda declarar terminada una fase si sólo existen pantallas o sólo existen endpoints.

## 8. Separación de actividades para cuatro personas

Como no se proporcionaron nombres, se usan identificadores de rol. El reparto sigue dominios verticales para reducir dependencias y conflictos de archivos.

### Frontend 1 - Servicio Social

**Propiedad principal:** recorridos del prestador y validadores.

- Crear navegación y rutas de asistencia.
- Implementar estado actual, check-in y check-out.
- Implementar historial, bolsa de horas, semáforo de riesgo y comentarios de validación.
- Construir bandejas individuales, aprobación masiva sólo verde, filtros y corrección/cierre de sesiones con observación.
- Implementar ausencias provisionales, justificaciones, aclaraciones, apelación, calendario y excepciones visibles según rol.
- Implementar requisitos, carga de nuevas versiones, retroalimentación y estados documentales cuando el contrato backend esté listo.
- Mostrar los estados de análisis (`PENDIENTE_ANALISIS`, `ANALIZANDO`, `DISPONIBLE`, `RECHAZADO`, `ERROR_ANALISIS`) sin confundirlos con la revisión funcional.
- Implementar indisponibilidad y sólo lectura con hora de última actualización, más el reporte referenciado de una asistencia en contingencia sin presentarla como hora validada.
- Incorporar la consulta y finalización del perfil académico del prestador sin mezclarlo con sede, área o permisos.
- Verificar Servicio Social con WCAG 2.2 AA mediante semántica, teclado, foco, formularios/errores relacionados, contraste, zoom/reflujo, estados dinámicos y pruebas de lector de pantalla.
- Implementar estados online-first de envío, confirmación, desconexión, tiempo agotado y resultado desconocido; consultar antes de reintentar para no duplicar asistencias.
- Después del núcleo, construir los MVP de visitas e inventario: invitaciones/check-in de visitantes, catálogo, movimientos, existencias y préstamos/devoluciones.
- Crear pruebas de componentes y recorridos críticos de Servicio Social.
- Asegurar estados vacíos, errores, carga, accesibilidad y comportamiento adaptable.

**Áreas sugeridas:** `frontend/app/portal/asistencia/`, `frontend/app/portal/validaciones/`, `frontend/app/portal/documentos/`, `frontend/app/visitas/`, `frontend/app/inventario/`, `frontend/components/attendance/` y `frontend/components/documents/`.

### Frontend 2 - Kairos y módulos de apoyo

**Propiedad principal:** experiencia de proyectos colaborativos.

- Crear rutas de proyectos y detalle de proyecto.
- Implementar alta/edición de proyecto y gestión de miembros con roles internos.
- Implementar actividades, responsable principal, participantes, transiciones y entregas de evidencia.
- Construir el Kanban después de estabilizar el flujo aprobado, haciendo que cada movimiento invoque una transición de dominio.
- Mantener visibles el historial, los comentarios, las entregas y las revisiones.
- Implementar centro de notificaciones, tableros operativos, exportaciones, invitaciones, recuperación de acceso, administración de sesiones, configuración MFA opcional y experiencia de contraseña/frase larga cuando existan sus contratos backend.
- Implementar avisos generales de contingencia y estados degradados de expediente, Kairos, biblioteca, tableros y sitio público, dejando claro qué funciones siguen disponibles.
- Mantener accesibles el shell, navegación, componentes compartidos, Kairos y sitio público; añadir pruebas automáticas de accesibilidad y revisión cruzada de los recorridos de Frontend 1.
- Implementar el directorio interno por alcance; gamificación e impresión 3D comienzan sólo después de estabilizar Kairos y el pipeline privado de archivos.
- Implementar la administración de instituciones, unidades académicas, programas y cohortes con nombres controlados.
- Construir la biblioteca operativa P2 con búsqueda, versiones, alcance, descarga y acuses explícitos, después de Kairos básico.
- Reutilizar componentes de carga y estados técnicos de análisis en Kairos, biblioteca y contenido público sin exponer archivos todavía en cuarentena.
- Completar el sitio público y su administración de contenido controlado después de los recorridos operativos prioritarios.
- Implementar consulta administrativa de conservación, retenciones, solicitudes y lotes de supresión sin exponer datos bloqueados a usuarios ordinarios.
- Construir la consulta de auditoría con filtros jerárquicos y vistas limitadas de eventos propios; consultar o exportar auditoría también debe dejar evento.
- Construir el perfil privado de gamificación con puntos/nivel, insignias e historial, más la solicitud/seguimiento de trabajos de impresión 3D para solicitante y operador.
- Verificar recorridos en Chrome/Edge/Firefox/Safari y vistas de 320 px en adelante, incluyendo teclado/táctil, respuesta perdida, reintento y carga interrumpida.
- Crear pruebas de componentes y recorridos críticos de Kairos.
- Extraer componentes reutilizables de tablas, filtros, paginación y carga de archivos sin cambiar el diseño global unilateralmente.

**Áreas sugeridas:** `frontend/app/proyectos/`, `frontend/components/kairos/`, `frontend/app/directorio/`, `frontend/app/notificaciones/`, `frontend/app/gamificacion/`, `frontend/app/impresion-3d/`, `frontend/app/admin/contenido/` y `frontend/components/reports/`.

### Backend 1 - Asistencia, horas y ausencias

**Propiedad principal:** núcleo transaccional de Servicio Social.

- Diseñar modelos y migraciones de asistencia, bolsa de horas, autorizaciones, ausencias y calendario.
- Implementar check-in/check-out con hora de servidor, idempotencia, transacción, una sola sesión abierta, corte diario y corrección auditada.
- Encapsular el cálculo de bolsa y las reglas versionadas del semáforo de riesgo detrás de políticas configurables.
- Implementar validación jerárquica, separación de funciones y aprobación masiva verde de máximo 100 registros sin acoplarla al contrato HTTP.
- Implementar ausencias provisionales, justificación, aclaración, apelación, soportes privados y excepciones jerárquicas.
- Implementar jobs de corte, avisos y ausencias con bloqueo, reintentos, idempotencia, notificaciones y métricas/logs.
- Incorporar indicadores de salud, correlación y alertas que permitan detectar y mitigar incidentes S1/S2 de asistencia, horas, validación y jobs dentro de los tiempos aprobados.
- Implementar la recuperación crítica con RPO de 15 minutos y RTO de 4 horas, incluyendo restauración punto en el tiempo, conciliación de asistencia/horas/auditoría y captura posterior de eventos de contingencia sujetos a revisión.
- Aplicar permisos `self`, `area`, `sede` y `global`.
- Diseñar el contrato/eventos base de auditoría append-only y asegurar que asistencia, validación, ausencias y jobs los persistan dentro de sus transacciones críticas.
- Entregar errores de dominio estructurados, estables y comprensibles para que frontend pueda asociarlos con campos, resúmenes y anuncios accesibles sin exponer detalles técnicos.
- Implementar después del núcleo los dominios de visitas e inventario: invitaciones temporales/entradas/salidas, artículos/ubicaciones/movimientos y préstamos idempotentes con alcance y auditoría.
- Mantener OpenAPI, pruebas unitarias, E2E e integración del dominio.

**Áreas sugeridas:** `backend/src/attendance/`, `backend/src/hours/`, `backend/src/absences/`, `backend/src/calendar/`, `backend/src/visits/` y `backend/src/inventory/`.

### Backend 2 - Documentos, Kairos y almacenamiento

**Propiedad principal:** colaboración y archivos.

- Crear la abstracción de almacenamiento S3-compatible y configuración local de MinIO.
- Implementar el pipeline compartido de cuarentena, validación de tipo/firma/tamaño, huella, scanner, reintentos, promoción privada y eliminación de archivos rechazados.
- Diseñar requisitos y versiones documentales inmutables, retroalimentación, estados aprobados y autorización de descarga.
- Diseñar proyectos Kairos y miembros con relaciones canónicas y roles internos distintos al rol global.
- Implementar actividades, participantes, entregas/evidencias inmutables, comentarios, revisión independiente y transiciones de estado.
- Garantizar autorización server-side en cada lectura y escritura de Kairos.
- Añadir soporte backend de Kanban como vistas/consultas sobre actividades, no como un dominio duplicado.
- Implementar invitaciones de cuenta, recuperación con tokens independientes, administración/revocación de sesiones, TOTP opcional, códigos de recuperación, Argon2id/lista de bloqueo, centro de notificaciones, correo transaccional, exportaciones asíncronas y directorio interno por alcance.
- Modelar catálogos académicos y adscripciones versionadas, completamente separados del alcance RBAC de sede/área.
- Reutilizar almacenamiento, auditoría y notificaciones para la biblioteca operativa versionada, sin introducir edición colaborativa en línea.
- Implementar contenido público versionado con componentes permitidos y separación explícita entre archivos públicos y privados.
- Preparar importadores idempotentes y reportes de conciliación sólo cuando exista una fuente heredada aprobada.
- Implementar categorías/versiones de retención, bloqueo, retención legal, supresión/anonimización y reaplicación de supresiones después de restaurar respaldos.
- Integrar documentos, archivos, acceso, Kairos, contenido y retención con el catálogo central de auditoría y su manifiesto de integridad.
- Incorporar indicadores de salud, correlación y alertas para autenticación, almacenamiento, scanner, notificaciones, exportaciones y supresión, con rutas de reintento o mitigación documentadas.
- Implementar restauración y conciliación de archivos/metadatos, respaldos/versionado del almacenamiento y recuperación diferenciada de expediente, Kairos, biblioteca, reportes y sitio público conforme a sus RPO/RTO.
- Entregar errores estructurados y metadatos accesibles para cargas, análisis, autenticación, Kairos y procesos asíncronos; ningún estado puede depender exclusivamente de un código o color del frontend.
- Implementar después de Kairos los dominios mínimos de gamificación e impresión 3D: eventos de puntos/insignias reversibles y trabajos/ejecuciones con STL privado analizado.
- Mantener ranking público, monedas, tienda, recompensas, control directo de impresoras y comercio electrónico fuera del MVP.
- Mantener OpenAPI, pruebas unitarias, E2E e integración de sus dominios.

**Áreas sugeridas:** `backend/src/storage/`, `backend/src/documents/`, `backend/src/kairos/`, `backend/src/gamification/`, `backend/src/printing-3d/`, `backend/src/invitations/`, `backend/src/notifications/`, `backend/src/reports/`, `backend/src/directory/` y `backend/src/public-content/`.

### Responsabilidades compartidas y regla de integración

| Archivo o decisión compartida                 | Responsable por cambio                                 | Regla                                                                                             |
| --------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `backend/prisma/schema.prisma`                | Backend dueño del incremento                           | Una migración pequeña y revisable por dominio; coordinar nombres antes de editar.                 |
| `backend/src/app.module.ts`                   | Backend que incorpora el módulo                        | PR corto de integración después de aprobar el módulo.                                             |
| `backend/src/auth/permissions.ts`             | Backend dueño del dominio                              | Todo permiso nuevo requiere prueba de matriz y alcance.                                           |
| `backend/src/openapi/openapi.document.ts`     | Backend dueño del endpoint                             | Actualizar en la misma entrega, no al final del proyecto.                                         |
| `frontend/components/portal/portal-shell.tsx` | Frontend dueño del incremento                          | Integrar navegación en cambios pequeños para evitar conflictos.                                   |
| `frontend/lib/types.ts`                       | Frontend consumidor del contrato                       | Preferir tipos por dominio cuando crezca; no duplicar enums con nombres alternativos.             |
| Diseño y componentes UI                       | Frontend 1 y Frontend 2                                | Acordar la interfaz del componente antes de extraerlo como compartido.                            |
| Auditoría transversal                         | Backend 1 diseña base; Backend 2 integra sus dominios  | Catálogo único, append-only, campos permitidos y transacción obligatoria en acciones críticas.    |
| Feature flags y piloto                        | Backend 1 define base; cada dueño integra su dominio   | Backend aplica el flag y alcance; frontend sólo representa disponibilidad. Cambios auditados.     |
| Gobernanza y aceptación                       | Responsable según tipo de decisión                     | Técnica reversible: técnico; regla de negocio: funcional/operativo; dato sensible: institucional. |
| Soporte e incidentes                          | Rotación primaria/secundaria entre las cuatro personas | Canal único; quien atiende coordina, cada dueño diagnostica su dominio y S1/S2 siguen runbook.    |
| Continuidad y recuperación                    | Backend 1 coordina; las cuatro personas participan     | Cada dueño restaura/concilia su dominio; frontend representa degradación y el simulacro se mide.  |
| Accesibilidad WCAG 2.2 AA                     | Frontend 2 mantiene base; Frontend 1 valida SS         | Ambos frontend revisan recorridos; backend entrega errores/estados estructurados y comprensibles. |
| Compatibilidad y conectividad                 | Frontend 2 mantiene matriz; todos prueban su recorrido | Online-first, navegadores modernos y reintentos idempotentes; no se simula éxito sin servidor.    |

## 9. Dependencias entre personas

| Entrega                | Backend requerido | Frontend consumidor | Condición para iniciar UI funcional                                                  |
| ---------------------- | ----------------- | ------------------- | ------------------------------------------------------------------------------------ |
| Check-in/check-out     | Backend 1         | Frontend 1          | Estados, errores, idempotencia y reglas de cierre manual definidos                   |
| Bolsa y validación     | Backend 1         | Frontend 1          | Política de riesgo, validación masiva y contrato OpenAPI aceptados                   |
| Ausencias/calendario   | Backend 1         | Frontend 1          | Reglas de exclusión, soportes, scheduler y avisos aceptados                          |
| Documentos             | Backend 2         | Frontend 1          | Estados, retroalimentación, límites, tipos y URLs de carga/descarga definidos        |
| Biblioteca operativa   | Backend 2         | Frontend 2          | Alcances, versiones, publicación, archivo y acuse explícito definidos                |
| Contenido público      | Backend 2         | Frontend 2          | Bloques permitidos, publicación, versionado y separación público/privado             |
| Pipeline de archivos   | Backend 2         | Frontend 1 y 2      | Cuarentena, estados técnicos, scanner, reintentos, promoción y descarga autorizada   |
| Retención y supresión  | Backend 2         | Frontend 2          | Categorías, plazos, bloqueo, retención legal, vista previa y ejecución por lotes     |
| Acceso, sesiones y MFA | Backend 2         | Frontend 2          | Invitación, recuperación, sesiones, TOTP opcional, Argon2id y política de contraseña |
| Perfil académico       | Backend 2         | Frontend 1 y 2      | Catálogos controlados, adscripción histórica y ausencia de efectos sobre RBAC        |
| Proyectos/miembros     | Backend 2         | Frontend 2          | Roles internos, matriz de permisos y alcance de proyecto aprobados                   |
| Actividades/evidencias | Backend 2         | Frontend 2          | Transiciones, trazabilidad de movimiento y reglas de revisión aprobadas              |
| Kanban                 | Backend 2         | Frontend 2          | Actividades estables, carriles y reglas de movimiento/evidencia mínima definidos     |
| Visitas                | Backend 1         | Frontend 1          | Invitación opaca/temporal, estados, alcance y registro autorizado de entrada/salida  |
| Inventario             | Backend 1         | Frontend 1          | Tipos de artículo, ubicaciones, movimientos, existencias y préstamos definidos       |
| Gamificación mínima    | Backend 2         | Frontend 2          | Eventos Kairos elegibles, idempotencia/reversión, nivel e insignias definidos        |
| Impresión 3D           | Backend 2         | Frontend 2          | Estados de trabajo/ejecución, permiso de operador y pipeline STL privado definidos   |

Los frontend pueden iniciar wireframes, estados de pantalla y componentes desacoplados mientras se cierra el contrato, pero no deben fijar reglas de negocio localmente para suplir un endpoint pendiente.

## 10. Definición de terminado por funcionalidad

Una funcionalidad se considera terminada sólo si cumple lo siguiente:

- Regla de negocio y estados aceptados.
- Migración Prisma versionada cuando corresponda.
- Autorización backend por permiso y alcance.
- Validación de entrada y manejo estable de errores.
- Contrato OpenAPI actualizado.
- Pruebas unitarias y E2E; integración para persistencia o concurrencia crítica.
- Pantalla con carga, vacío, error, éxito y permisos correctos.
- Prueba frontend del recorrido crítico.
- El proceso completo cumple los criterios WCAG 2.2 AA aplicables y se verifica con lint/análisis automático, teclado, foco, contraste, zoom/reflujo y revisión manual con lector de pantalla; una prueba automática por sí sola no basta.
- El recorrido funciona en la matriz 30.1B, desde 320 px y con teclado/táctil. Se prueban desconexión, latencia, respuesta desconocida y reintento; sólo una confirmación del servidor permite mostrar éxito.
- Auditoría para cambios sensibles.
- Auditoría con actor/acción/objeto/resultado/correlación y diff permitido, sin contraseñas, tokens, secretos o contenido sensible completo.
- Acción operativa verificada para cada rol autorizado y denegada para los demás.
- Ninguna credencial heredada reutilizada en código, documentación, seeds o entornos.
- Documentación breve de operación si existe scheduler, almacenamiento o configuración nueva.
- Monitoreo y procedimiento de recuperación para jobs, archivos o notificaciones que puedan fallar fuera de una petición HTTP.
- Las fallas capaces de producir un incidente S1/S2 tienen señal observable, correlación, alerta, runbook de mitigación y responsable de escalamiento; el recorrido se ejercita antes del piloto.
- Los RPO/RTO de la categoría están documentados y medibles; la restauración prueba base, objetos, auditoría, retenciones y contingencias, sin habilitar el entorno antes de conciliarlo.
- Si acepta archivos, ninguno queda disponible antes de validar tipo/tamaño/firma y obtener resultado limpio del análisis; los estados técnicos tienen pruebas de éxito, rechazo y fallo/reintento.
- Todo modelo con datos personales u operativos declara categoría de conservación, evento inicial y comportamiento de bloqueo/supresión; no se habilita borrado automático sin regla aprobada y prueba de restauración.
- La funcionalidad puede habilitarse/deshabilitarse por los anillos aprobados desde backend y tiene métricas, criterio de reversión y manual breve para soporte piloto.
- Los criterios de aceptación se vinculan a una decisión vigente y los aprueba el responsable correspondiente; un cambio posterior crea una decisión sustitutiva y actualiza pruebas/documentación.

## 11. Registro de decisiones funcionales aprobadas

Las siguientes decisiones fueron aprobadas manualmente durante la reconstrucción y están vigentes al 25 de agosto de 2026. Sustituyen las propuestas incompatibles de los documentos heredados. El legado continúa siendo evidencia de contexto, pero ya no decide el comportamiento nuevo cuando contradice este registro.

### 11.1 Estrategia y alcance del producto

| ID  | Decisión aprobada                                      | Consecuencia para el desarrollo                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1B  | Reconstrucción conservadora por módulos                | Los PDF son hipótesis y referencia, no especificación obligatoria. Se completarán recorridos esenciales antes de recuperar módulos secundarios o inciertos.                                                                                                          |
| 7B  | Kairos básico después del núcleo de Servicio Social    | La liberación 1 completa Servicio Social. La liberación 2 incorpora proyectos, miembros, actividades, asignaciones, evidencias, comentarios e historial; Kanban avanzado y automatizaciones quedan después.                                                          |
| 8B  | Gamificación diferida y simplificada                   | Se mantiene como antecedente: las dos primeras liberaciones no tendrán gamificación. La decisión 31 vuelve obligatorio un MVP posterior basado únicamente en actividades Kairos aprobadas; monedas, tienda, ranking público y rachas de asistencia siguen excluidos. |
| 10B | Directorio interno con alcance                         | No habrá directorio público de usuarios. Los contactos institucionales serán visibles según área o proyecto, con preferencias de privacidad; los usuarios inactivos se ocultan sin perder historial.                                                                 |
| 11B | Impresión 3D originalmente condicionada                | La decisión 31 elimina la condición y conserva el diseño: `TrabajoImpresion3D` canónico, ejecuciones separadas, STL privado y permisos de operador; no se copian los modelos duplicados del legado.                                                                  |
| 12B | Visitas originalmente condicionadas                    | La decisión 31 elimina la condición y conserva el diseño: invitación privada/temporal, visitante sin cuenta, personal autorizado confirma entrada/salida y el QR identifica pero no autoriza.                                                                        |
| 13B | Inventario operativo básico originalmente condicionado | La decisión 31 elimina la condición y conserva el diseño: consumibles y activos separados, movimientos auditables, ubicaciones, existencias y préstamos; sin compras, contabilidad ni ERP.                                                                           |
| 31  | Cierre funcional con cuatro MVP obligatorios           | Gamificación, impresión 3D, visitas e inventario pasan a P3/Incremento 5 con alcance mínimo vinculante. No quedan decisiones funcionales abiertas para iniciar el desarrollo; ampliaciones avanzadas requerirán una solicitud futura.                                |

### 11.2 Servicio Social, documentos y reglas operativas

| ID   | Decisión aprobada                                      | Reglas vinculantes                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2A   | Asistencia en tiempo real con correcciones controladas | Sólo puede existir una sesión abierta por usuario. Check-in y check-out usan la hora del servidor. El prestador no edita directamente sus sesiones; una persona autorizada puede corregir o cerrar con motivo y auditoría.                                                                                                                                                                              |
| 2.1B | Corte automático diario con revisión obligatoria       | A las 23:59 de `America/Mexico_City`, una sesión sin salida se cierra técnicamente como `CHECKOUT_OMITIDO`, riesgo rojo y `REQUIERE_REVISION`. Sus horas no se contabilizan hasta resolución y el usuario puede iniciar una sesión nueva al día siguiente. La primera versión no admite turnos nocturnos.                                                                                               |
| 3B   | Semáforo de riesgo explicable y consultivo             | Riesgo y validación son conceptos separados. Cada color muestra códigos de motivo y versión de reglas; nunca aprueba ni rechaza por sí solo. Sólo registros verdes son elegibles para operaciones masivas.                                                                                                                                                                                              |
| 3.1C | Umbrales híbridos configurables                        | Menos de 5 min: rojo; 5–29 min: amarillo; 30 min–8 h: normal sin otras incidencias; más de 8–10 h: amarillo; más de 10 h: rojo. Fuera de turno es amarillo; omisión de salida, solapamiento o inconsistencia es rojo; una sesión corregida conserva como mínimo amarillo.                                                                                                                               |
| 4B   | Validación jerárquica con separación de funciones      | Coordinación revisa/corrige, pero no emite autorización final. Jefaturas validan según área/sede y administración según alcance global. No hay autovalidación ni validación final por quien corrigió. Sólo se aprueban en lote registros verdes, máximo 100 por lote, con revalidación de estado, riesgo y versión; amarillo/rojo requieren revisión individual. No existe rechazo o corrección masiva. |
| 5C   | Ausencia provisional con justificación                 | La ausencia inicia `PENDIENTE_JUSTIFICACION`, nunca como falta definitiva. Se excluyen usuarios inactivos, días sin turno y excepciones de calendario. Cualquier sesión evita la ausencia automática, aunque una sesión anormal siga su propia revisión. Los resultados son `JUSTIFICADA`, `NO_JUSTIFICADA`, `CANCELADA` o solicitud de aclaración.                                                     |
| 5.1B | Plazos, evidencia y apelación                          | Hay 5 días hábiles para justificar y 2 para responder una aclaración. El comentario siempre es obligatorio y la evidencia depende del tipo. Al vencer, pasa a `NO_JUSTIFICADA` con `PLAZO_VENCIDO`. Existe una apelación ordinaria dentro de 3 días hábiles y debe resolverla una autoridad distinta o superior. Los soportes son privados y admiten PDF/JPG/PNG.                                       |
| 5.2B | Calendario jerárquico de excepciones                   | El turno es la base. Las excepciones pueden ser globales, por sede, área o usuario, con precedencia usuario > área > sede > global > turno. Admiten festivo, vacaciones, suspensión, permiso, horario especial o asistencia extraordinaria y efectos explícitos. Cambios retroactivos requieren vista previa y auditoría; una falta definitiva no se altera sin confirmación.                           |
| 6B   | Expediente documental versionado                       | Requisito, archivo y versión son entidades distintas. Estados: `PENDIENTE_CARGA`, `EN_REVISION`, `AUTORIZADO`, `RECHAZADO`, `REQUIERE_CORRECCION`, `VENCIDO` y `CANCELADO`. Cada carga crea versión inmutable; no hay autoautorización. Los archivos privados se guardan en S3/MinIO, con PDF/JPG/PNG y límite inicial configurable de 10 MB.                                                           |

### 11.3 Contrato inicial de Kairos

| ID   | Decisión aprobada                  | Reglas vinculantes                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1B | Cuatro roles internos por proyecto | Cada proyecto tiene un solo `PROPIETARIO`, además de `SUBLIDER`, `COLABORADOR` y `OBSERVADOR`. Estos roles no sustituyen los roles globales. Propietario administra; sublíder coordina operación; colaborador trabaja y entrega evidencia; observador sólo consulta. En la primera versión, prestadores no crean proyectos. Quitar miembros conserva historial y transferir propiedad exige auditoría.   |
| 7.2B | Flujo controlado de actividades    | Estados: `PENDIENTE`, `EN_PROGRESO`, `BLOQUEADA`, `EN_REVISION`, `REQUIERE_CORRECCION`, `TERMINADA` y `CANCELADA`. Existe un responsable principal y participantes. Cada entrega genera evidencia inmutable y debe revisarla otra persona, propietario o sublíder. Reabrir exige motivo; “vencida” es una condición derivada. Un Kanban futuro invocará transiciones de dominio y no saltos arbitrarios. |

Completar actividades de Kairos no agrega horas de Servicio Social. Cualquier integración futura deberá ser explícita y conservar ambos historiales por separado.

### 11.4 Plataforma, acceso y comunicación

| ID               | Decisión aprobada                                   | Reglas vinculantes                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9B               | Tableros operativos y exportaciones controladas     | Métricas de asistencia, validación, ausencias y documentos, y después Kairos, siempre filtradas en backend por alcance. Refresco manual o cada 60 segundos, sin WebSockets iniciales. CSV UTF-8 es el primer formato; más de 5,000 filas se procesa en segundo plano. Rango interactivo predeterminado de 30 días y máximo de un año; descargas privadas, temporales y auditadas.                       |
| 14B              | Activación por invitación institucional controlada  | Un responsable crea la prealta con rol y alcance; el invitado no puede elevarlos. El enlace es privado, de un uso, revocable y vence inicialmente en 72 horas. Puede enviarse por correo o copiarse manualmente mientras no exista proveedor. Nadie entrega una contraseña temporal. Estados de cuenta: `INVITADA`, `ACTIVA`, `SUSPENDIDA`, `DESACTIVADA` y `BLOQUEADA`; no se borra historial.         |
| 15B              | Centro interno más correo transaccional             | Todo evento relevante crea notificación interna. Seguridad, invitaciones, vencimientos, incidencias que afecten horas y resoluciones oficiales también envían correo y no pueden desactivarse. Avisos secundarios pueden agruparse en resumen. El correo sólo contiene resumen y enlace, nunca evidencia sensible. Un fallo de entrega no revierte la operación; se reintenta y registra.               |
| 16B              | Migración selectiva y certificada                   | Sólo se importan conjuntos necesarios y confiables. Cada lote debe inventariarse, mapearse, simularse, aprobarse, importarse y conciliarse. La carga será repetible e idempotente y conservará identificadores y procedencia.                                                                                                                                                                           |
| 17B              | Ubicación y red como evidencia, nunca como bloqueo  | Cada sede puede activar señales de ubicación, red o ambas. Sólo se capturan al registrar entrada/salida y alimentan códigos explicables de riesgo. Una falla, denegación o resultado fuera de sede no impide registrar la asistencia; amarillo y rojo se revisan individualmente según las reglas aprobadas.                                                                                            |
| 18B              | Contenedores y servicios de datos administrados     | Habrá entornos local, staging y producción aislados. Frontend y backend se despliegan como imágenes identificables y se promueve a producción la misma imagen validada en staging. MariaDB y almacenamiento serán administrados; Kubernetes no forma parte del inicio.                                                                                                                                  |
| 19B              | Organización operativa y academia separadas         | `Sede -> Área` controla operación y permisos. Institución, unidad académica, programa y cohorte describen la procedencia del prestador, alimentan perfil/reportes y nunca conceden acceso. La adscripción académica conserva historial.                                                                                                                                                                 |
| 20B              | Biblioteca operativa controlada y versionada        | Manuales, procedimientos, formatos y políticas se publican por alcance con versiones e historial. No reemplaza directorios, asistencias, actividades o bitácoras estructuradas; tampoco incluye edición colaborativa o firma electrónica.                                                                                                                                                               |
| 21B              | Sitio institucional público limitado                | Inicio, Servicio Social, FAQ, acerca de, contacto e información legal se publican mediante contenido controlado y versionado. No expone usuarios, directorio, horas, archivos, proyectos o invitaciones; tampoco permite autorregistro ni formularios anónimos en la primera versión.                                                                                                                   |
| 22B              | Recuperación autoservicio y sesiones controladas    | Las cuentas activas recuperan acceso mediante correo y token de un uso; existe alternativa administrativa auditada sin contraseñas temporales. Las sesiones expiran, pueden listarse/revocarse y se invalidan ante cambios sensibles.                                                                                                                                                                   |
| 22.1B modificada | MFA opcional para todos los roles                   | Cualquier usuario puede habilitar TOTP y códigos de recuperación, pero ningún rol está obligado a hacerlo ni pierde funciones por omitirlo. Una vez habilitado, el segundo factor se exige en cada nueva sesión hasta que se desactive mediante un flujo controlado.                                                                                                                                    |
| 22.2B            | Contraseñas largas, bloqueadas y sin rotación       | Mínimo 15 y máximo 128 caracteres, espacios/Unicode permitidos, sin composición ni vencimiento periódico. Se rechazan valores comunes/comprometidos, se permite pegado/autocompletado y los hashes nuevos usan Argon2id con transición controlada desde bcrypt.                                                                                                                                         |
| 23B              | Cuarentena y análisis automático de archivos        | Todo archivo de usuario queda privado hasta validar tipo, firma, tamaño y resultado antimalware. El estado técnico no sustituye la revisión funcional; fallar el scanner nunca equivale a limpio y los rechazados pierden su contenido, conservando sólo auditoría mínima.                                                                                                                              |
| 24B              | Matriz de conservación y supresión                  | Cada categoría define finalidad, evento inicial, periodos activo/bloqueado y acción final. Datos de negocio no se borran hasta contar con plazo institucional aprobado; temporales usan valores provisionales. Admite retención legal, anonimización, solicitudes y reaplicación de supresiones tras restaurar respaldos.                                                                               |
| 25B              | Auditoría central append-only y verificable         | Cada acción sensible registra actor, rol/alcance, correlación, acción, objeto, resultado, motivo, diff permitido y versión de política. Los eventos no se editan: se compensan; cambios críticos y auditoría comparten transacción y hashes/manifiestos permiten detectar alteraciones.                                                                                                                 |
| 26B              | Liberación progresiva por anillos y pilotos         | Servicio Social se prueba como recorrido completo en una sede/área antes de expandirse; Kairos tiene piloto separado. Feature flags server-side controlan exposición y cada anillo exige entrada, observación, conciliación y salida explícita. Revertir detiene operaciones nuevas sin borrar historial.                                                                                               |
| 27B              | Gobernanza provisional ligera                       | Responsables funcional, operativo, técnico, de liberación y de datos/archivo deciden según competencia. Las decisiones se versionan y los cambios se clasifican; silencio no aprueba. Los nombres pueden faltar durante desarrollo, pero deben asignarse antes del piloto.                                                                                                                              |
| 28B              | Soporte por severidad y guardia reforzada en piloto | Existe un canal único, clasificación S1–S4, objetivos internos de reconocimiento/mitigación y responsables primario/secundario. La cobertura ordinaria es hábil; las primeras dos semanas del piloto tienen guardia pasiva durante la operación real y sólo S1 exige atención inmediata fuera del horario ordinario. S1 y S2 requieren comunicación y los incidentes críticos dejan revisión posterior. |
| 29B              | Recuperación diferenciada y degradación controlada  | Identidad, asistencia, horas y auditoría crítica tienen RPO de 15 minutos y RTO de 4 horas; expediente/configuración recuperan en hasta 8 horas y módulos secundarios en un día hábil. Sólo se ofrece lectura degradada cuando los datos sean confiables. Las asistencias no registradas se reportan y después se capturan como contingencia auditada sujeta a revisión.                                |
| 30B              | WCAG 2.2 AA como criterio de terminado              | Cada proceso completo liberado debe ser perceptible, operable por teclado, comprensible y robusto, con foco/contraste/reflujo/errores correctos. Lint y análisis automático se combinan con pruebas manuales, lector de pantalla y revisión cruzada; no se afirma certificación legal externa.                                                                                                          |
| 30.1B            | Multiplataforma moderna y online-first              | Chrome/Edge/Firefox/Safari modernos en escritorio y móvil, desde 320 px y sin navegadores legacy. Sólo el servidor confirma operaciones; respuestas inciertas se consultan/reintentan con idempotencia. No hay check-in offline: una interrupción usa la contingencia 29B.                                                                                                                              |

### 11.5 Reglas de ubicación y red aprobadas

- La política por sede puede ser `SIN_VALIDACION`, `UBICACION_INFORMATIVA`, `RED_INFORMATIVA` o `UBICACION_Y_RED`.
- Sólo durante check-in y check-out se pueden registrar coordenadas consentidas, precisión del dispositivo, IP observada por el servidor, sede, hora y versión de la política. No existe seguimiento continuo.
- Una ubicación dentro del perímetro no agrega riesgo. Si la política la espera, `UBICACION_NO_VERIFICADA`, `FUERA_DE_SEDE` o `RED_NO_RECONOCIDA` producen amarillo; `DATOS_DE_UBICACION_INCONSISTENTES` produce rojo.
- Una excepción vigente de trabajo remoto o asistencia extraordinaria evita penalizar una ubicación exterior y queda vinculada a la evaluación.
- Coordenadas e IP completas sólo son visibles para personal autorizado. No se incluyen en tableros o exportaciones ordinarias y no constituyen por sí solas prueba de identidad.
- Los perímetros y políticas son configurables y versionados. Cada evaluación conserva la versión aplicada para que el resultado siga siendo explicable después de un cambio.

### 11.6 Reglas específicas de migración aprobadas

La migración 16B se ejecutará sólo si aparecen fuentes del sistema anterior, como una base, CSV, archivos administrativos o saldos confirmados. La falta de una fuente no bloquea el desarrollo nuevo.

- **Organización:** importar únicamente sedes, áreas, turnos, jerarquías y catálogos todavía vigentes; excluir pruebas y duplicados.
- **Usuarios:** importar sólo personas que necesiten acceso. Correo, identificador y alcance deben deduplicarse. Los roles se convierten mediante una tabla explícita y todos activan su cuenta con una invitación 14B.
- **Credenciales:** nunca importar contraseñas, hashes, sesiones, tokens ni invitaciones anteriores.
- **Horas:** si el detalle es consistente, se conserva como historial de sólo lectura y origen identificable. Si sólo existe un total confirmado, se registra un saldo histórico inicial auditable; no se inventan entradas o salidas para reconstruirlo.
- **Documentos:** importar sólo archivos localizables, atribuibles y necesarios. Si no existe prueba de autorización, entran como `HISTORICO_SIN_VALIDACION` o se envían a revisión.
- **Datos secundarios:** no migrar por defecto gamificación, notificaciones, sesiones técnicas, inventario de demostración, visitas, impresión 3D ni proyectos de prueba.
- **Excepciones:** los registros ambiguos se reportan y separan; no afectan horas, permisos o estados oficiales hasta una resolución manual.

### 11.7 Reglas de despliegue y operación aprobadas

- **Local:** Docker Compose, MariaDB/MinIO locales, correo de desarrollo y datos ficticios, sin conexión a staging o producción.
- **Staging:** arquitectura equivalente a producción, con base, almacenamiento y secretos propios; utiliza datos de prueba o anonimizados y valida migraciones, jobs, correo, archivos y exportaciones.
- **Producción:** base, almacenamiento, secretos y dominio exclusivos. Sólo recibe versiones aprobadas y conserva acceso administrativo limitado y auditable.
- CI construye imágenes identificadas por commit, despliega primero en staging y promueve exactamente la misma imagen a producción. Las migraciones Prisma se ejecutan una sola vez mediante una operación controlada.
- Frontend, backend y procesos asíncronos se ejecutan como contenedores o jobs administrados. Un job debe usar bloqueo o elección de líder, ser idempotente, registrar ejecución, admitir reintento y alertar al fallar.
- La observabilidad mínima incluye salud de servicios/dependencias, logs estructurados con identificador de petición, agrupación de errores, disponibilidad, latencia, respuestas fallidas, métricas de jobs y alertas operativas.
- MariaDB tendrá recuperación punto en el tiempo suficiente para el RPO crítico de 15 minutos, además de respaldo automático diario con retención inicial de 30 días. Los archivos usarán redundancia o versionado y se probará periódicamente una restauración coordinada de base y archivos.
- Un respaldo productivo no se reutiliza directamente en desarrollo. Staging y producción nunca comparten bases, buckets o credenciales.
- El repositorio no selecciona proveedor ni presupuesto. La arquitectura permanece portable y configurable; el aprovisionamiento externo se resolverá fuera de este plan sin cambiar el dominio aprobado.

### 11.8 Reglas de organización académica aprobadas

- La jerarquía operativa `Sede -> Área -> Usuario` continúa siendo la única base organizacional para permisos, validaciones, calendarios y tableros por alcance.
- La procedencia académica se modela por separado mediante institución, unidad o centro académico opcional, programa/carrera, cohorte/generación opcional y adscripción del prestador.
- Una adscripción conserva fecha inicial/final y vigencia. Cambiar de carrera o institución crea historial y no sobrescribe silenciosamente la relación anterior.
- Sólo el rol `PRESTADOR` necesita datos académicos. Puede activar su cuenta antes de completarlos, pero debe completar el perfil antes de formalizar su expediente o iniciar el periodo de servicio.
- El prestador consulta sus datos y solicita corrección; personal autorizado confirma los cambios oficiales. Los catálogos usan nombres controlados y los elementos inactivos conservan referencias históricas sin admitir nuevas asignaciones.
- Ninguna institución, carrera, centro o generación concede permisos. La visibilidad en reportes continúa limitada por el alcance operativo del usuario que consulta.
- La migración incorpora adscripciones académicas únicamente cuando sus relaciones puedan identificarse de forma confiable.

### 11.9 Reglas de biblioteca operativa aprobadas

- La biblioteca admite manuales, procedimientos, reglamentos, formatos, instructivos, protocolos, material de capacitación, plantillas, comunicados permanentes y políticas.
- El directorio interno, asistencias, actividades, incidencias y auditoría permanecen como datos estructurados. Una bitácora que requiera búsqueda, estados o reportes debe convertirse en funcionalidad de dominio, no en una hoja subida periódicamente.
- Cada documento tiene alcance `GLOBAL`, `SEDE`, `AREA` o `PROYECTO` y estados `BORRADOR`, `EN_REVISION`, `PUBLICADO` y `ARCHIVADO`.
- Una actualización crea una versión nueva con autor, revisor/publicador, vigencia, resumen de cambios y motivo de archivo o sustitución; nunca reemplaza silenciosamente la versión publicada.
- Coordinación crea borradores dentro de su alcance; jefaturas revisan/publican por área o sede y administración publica globalmente. Archivar o sustituir requiere motivo y las descargas se autorizan desde backend.
- Los formatos iniciales son PDF, DOCX, XLSX, PPTX, JPG y PNG, con límite configurable inicial de 25 MB. Ares permite almacenar y descargar, no editar en línea.
- Un documento puede marcarse `REQUIERE_ACUSE`. El acuse registra usuario, versión y momento de confirmación; es distinto de leer una notificación y no equivale a firma electrónica o aceptación legal.
- La biblioteca pertenece a P2 y se construye después del expediente del prestador y Kairos básico, reutilizando almacenamiento, auditoría y notificaciones.

### 11.10 Reglas del sitio público aprobadas

- Las páginas públicas iniciales son Inicio, Servicio Social, Preguntas frecuentes, Acerca de Ares, Contacto e información legal.
- No se publican perfiles, directorio interno, datos personales, horarios, asistencias, horas, documentos, evidencias, proyectos privados, ubicación/IP ni enlaces de invitación.
- No existe autorregistro. La cuenta se obtiene únicamente mediante la invitación institucional 14B.
- Contacto muestra datos institucionales autorizados; la primera versión no almacena mensajes anónimos. Un formulario futuro requerirá una decisión sobre responsable, plazo, protección contra abuso y retención.
- El contenido usa componentes controlados —texto, encabezados, listas, enlaces, avisos, imágenes y preguntas/respuestas— y estados `BORRADOR`, `PUBLICADO` o `ARCHIVADO`; no admite HTML arbitrario ni scripts.
- Cada publicación conserva autor, publicador, fecha, versión y resumen de cambios. Sólo administración global publica; otros responsables requieren permiso para preparar borradores.
- Todo archivo público debe clasificarse explícitamente como público. No se reutiliza una URL privada del expediente o de la biblioteca operativa.
- El sitio debe ser adaptable y accesible, usar URLs y metadatos estables y mantener separadas la navegación pública y la del portal autenticado.
- Este alcance pertenece a P3 y no desplaza Servicio Social, expediente ni Kairos básico.

### 11.11 Reglas de recuperación y sesiones aprobadas

- La solicitud pública responde de forma genérica sin revelar si el correo existe, está suspendido o se encuentra inactivo y aplica límites de frecuencia e intentos.
- El token de recuperación es distinto de una invitación, aleatorio, protegido en almacenamiento, de un uso y con vigencia inicial de 30 minutos. Solicitar otro invalida el anterior y no cambia o bloquea la cuenta antes de presentarlo correctamente.
- Un restablecimiento válido cambia la contraseña, invalida el token y todas las sesiones, registra auditoría, envía confirmación y exige iniciar sesión nuevamente. No se utilizan preguntas de seguridad.
- Si la persona perdió el correo, un responsable verifica su identidad mediante procedimiento institucional, actualiza el correo de forma auditada y genera recuperación/invitación. Nunca elige, consulta o transmite una contraseña; tampoco recupera su propia cuenta sin otra autoridad.
- Sólo `ACTIVA` permite autoservicio. `INVITADA` completa la invitación y `SUSPENDIDA`, `DESACTIVADA` o `BLOQUEADA` requieren resolver primero su estado, sin que la respuesta pública revele cuál aplica.
- Una sesión expira tras 30 minutos de inactividad o 8 horas absolutas, se invalida en frontend y servidor y no ofrece permanencia indefinida. La interfaz advierte antes de expirar cuando sea posible.
- El usuario consulta sus sesiones con dispositivo aproximado, inicio, última actividad y sesión actual; puede cerrar una, las demás o todas. No se muestra la IP completa.
- Restablecer contraseña, cambiar administrativamente el correo, suspender/bloquear/desactivar, cambiar rol o alcance y una revocación explícita cierran todas las sesiones.

### 11.12 Reglas de MFA opcional aprobadas

- MFA es opcional para `ADMIN`, jefaturas, coordinación y prestadores. No configurarlo no impide entrar, validar, administrar o utilizar cualquier función permitida por RBAC.
- El método inicial es TOTP mediante aplicación autenticadora. Correo y SMS no se consideran segundo factor; passkeys o llaves de seguridad quedan como ampliación futura.
- Cualquier usuario puede activarlo desde su perfil confirmando un código válido. Una vez activo se exige en cada sesión nueva hasta que el usuario lo deshabilite mediante un flujo controlado.
- La activación genera diez códigos de recuperación de un uso, visibles una sola vez y almacenados de forma protegida. Regenerarlos invalida el conjunto anterior y utilizar uno genera notificación.
- Desactivar o reemplazar MFA exige contraseña y un TOTP/código vigente. Si el usuario perdió ambos, una autoridad verifica identidad, revoca la configuración, cierra sesiones y obliga a configurarla nuevamente sólo si el usuario desea conservar MFA.
- Ninguna autoridad consulta la clave TOTP y nadie restablece su propio MFA mediante recuperación administrativa sin intervención de otra persona autorizada.
- Para acciones sensibles, una cuenta con MFA utiliza reautenticación reciente con su segundo factor; una cuenta sin MFA utiliza reautenticación reciente con contraseña. La ventana inicial es de 15 minutos.
- Los eventos de activación, desactivación, regeneración, recuperación y uso de códigos quedan auditados y generan las notificaciones correspondientes.

### 11.13 Reglas de contraseña aprobadas

- Todas las contraseñas tienen entre 15 y 128 caracteres. Se permiten espacios y Unicode, no se truncan silenciosamente y no se reduce el requisito si el usuario activa MFA.
- No se exige una combinación artificial de mayúsculas, minúsculas, números o símbolos. La UI permite pegado, autocompletado, mostrar/ocultar y ofrece un indicador orientativo de fortaleza.
- Se rechazan valores comunes, filtrados, secuenciales, variantes obvias de Ares y valores equivalentes al correo/código. La comprobación no envía la contraseña completa a terceros y explica de forma útil el rechazo.
- No hay cambio periódico. Se fuerza sólo por solicitud, recuperación, evidencia de compromiso, exposición conocida o cambio técnico del autenticador.
- Los hashes nuevos usan Argon2id con algoritmo, versión y parámetros registrados y calibrados por entorno. Bcrypt costo 12 se acepta temporalmente sólo para verificar usuarios existentes y se reemplaza por Argon2id al iniciar sesión o restablecer; si no existen usuarios reales, se migra directamente.
- Tras fallos se aplican respuestas genéricas, límites por cuenta/red y retraso progresivo. Diez fallos consecutivos producen bloqueo temporal inicial de 15 minutos, notificación y observabilidad, sin bloqueo permanente sin recuperación.
- Cambiar voluntariamente exige contraseña actual y, si está activo, MFA reciente. La nueva no puede ser igual a la actual, cierra las demás sesiones y genera notificación; no se conserva una historia extensa porque no existe rotación periódica.

### 11.14 Reglas de archivos y cuarentena aprobadas

- Todo archivo cargado por usuario usa un identificador/nombre interno generado y conserva el nombre original sólo como metadato. Se guarda primero en una zona privada de cuarentena con huella SHA-256.
- Los estados técnicos son `RECIBIDO`, `PENDIENTE_ANALISIS`, `ANALIZANDO`, `DISPONIBLE`, `RECHAZADO`, `ERROR_ANALISIS` y `ELIMINADO`; son independientes de `EN_REVISION`, `AUTORIZADO` u otros estados funcionales.
- Se validan permiso, límite del módulo, extensión permitida, MIME detectado, firma/estructura, archivo vacío o truncado y resultado antimalware. No se confía en el nombre o `Content-Type` del cliente.
- Inicialmente se rechazan ejecutables, scripts, HTML, ZIP/contenedores, dobles extensiones engañosas y Office con macros. Expediente conserva PDF/JPG/PNG y 10 MB; biblioteca PDF/DOCX/XLSX/PPTX/JPG/PNG y 25 MB; Kairos define lista/límite por tipo de evidencia.
- Sólo un resultado limpio promueve el archivo a almacenamiento disponible. Un fallo permanece privado, se reintenta y termina `ERROR_ANALISIS` si se agotan intentos; nunca se interpreta como limpio.
- Si se detecta contenido peligroso, se elimina el binario de cuarentena y se conserva únicamente metadato mínimo, huella, motivo, fecha y auditoría. El usuario puede cargar otro archivo y el evento alimenta observabilidad.
- Las descargas se autorizan por solicitud, usan URL privada breve, nombre seguro y encabezados que impiden interpretación inesperada. No existen URLs permanentes o indexables para contenido privado.
- Local usa scanner en contenedor y staging/producción un servicio privado o administrado. Justificantes, expedientes y evidencias no se envían a servicios públicos de análisis.

### 11.15 Reglas de conservación y supresión aprobadas

- La matriz clasifica identidad/cuenta, perfil académico, asistencia/horas, ausencias/justificantes, expediente, Kairos/evidencias, biblioteca, auditoría, notificaciones/correo, sesiones/tokens, logs, exportaciones y archivos rechazados.
- Cada regla versionada declara finalidad, responsable, evento que inicia el plazo, periodo activo, periodo bloqueado/archivado, acción final, fundamento y fecha de aprobación.
- El ciclo es `ACTIVO -> BLOQUEADO_ARCHIVADO -> SUPRESION_PROGRAMADA -> SUPRIMIDO` o `ANONIMIZADO`. Bloqueado no aparece en operación normal, no se modifica y sólo admite consulta excepcional autorizada.
- Una `RETENCION_LEGAL` pausa la supresión por investigación, apelación, auditoría, procedimiento o solicitud de autoridad; exige motivo, responsable y revisión y no es indefinida por omisión.
- Hasta aprobar el catálogo institucional no se eliminan automáticamente asistencias, horas, expedientes, justificantes o auditoría. Se permiten provisionales: exportaciones 24 h; metadatos de sesiones cerradas y logs ordinarios 90 días; tokens inutilizados al vencer; binarios peligrosos eliminados inmediatamente.
- Una solicitud de cancelación abre expediente: verifica identidad/finalidad/obligaciones, clasifica qué se cancela, bloquea o conserva, obtiene resolución, ejecuta acciones y notifica. No dispara borrado inmediato.
- Cada lote ofrece vista previa, dependencias, autorización, pausa, ejecución idempotente y reporte. Cambiar reglas calcula impacto y no altera silenciosamente fechas existentes.
- La supresión elimina o anonimiza contenido personal y conserva constancia mínima sin datos eliminados. Los respaldos no amplían plazos; al restaurar se reaplica el registro de supresiones antes de habilitar el entorno.
- Los plazos institucionales definitivos se gestionarán fuera de este plan. Mientras no existan, el equipo implementa la matriz y conserva datos de negocio sin supresión automática, usando sólo los plazos provisionales ya aprobados para temporales.

### 11.16 Reglas de auditoría transversal aprobadas

- Auditoría de negocio y logs técnicos son repositorios/conceptos separados. La primera explica decisiones y cambios; los segundos diagnostican ejecución, errores y rendimiento.
- Cada evento usa ID, hora UTC del servidor, correlación, actor humano/sistema, usuario afectado, rol/alcance efectivo, módulo, código de acción, objeto, resultado, motivo/comentario requerido, diff permitido, versión de política y referencia de lote/job.
- El catálogo incluye acceso/cuentas, asistencia/validación, ausencias/calendario, documentos/archivos, Kairos, configuración, exportaciones, publicación, migración, retención y supresión. Jobs se identifican como actor de sistema con ejecución concreta.
- Los diffs se definen por dominio y no copian filas o cuerpos HTTP completos. Nunca registran contraseñas/hashes, tokens, TOTP, cookies, enlaces de recuperación, binarios, justificantes completos, claves o cadenas de conexión; datos personales se minimizan o pseudonimizan.
- Los eventos son append-only. Un error se corrige con evento compensatorio enlazado; no se actualiza o borra el original mediante CRUD normal.
- Una acción crítica y su evento se confirman en la misma transacción; si falla auditoría, falla la acción. Lotes registran evento del lote y uno por elemento. Los logs técnicos no críticos pueden ser asíncronos.
- Los eventos incluyen hash de integridad y se encadenan por partición/periodo; un manifiesto diario privado permite detectar cambios o pérdidas. Esta verificación no se presenta como firma electrónica o no repudio jurídico.
- La consulta filtra por fecha, actor, afectado, módulo, acción, objeto, resultado, sede/área y correlación, respetando alcance. Usuarios ven una vista limitada de eventos propios; consultar/exportar auditoría también queda auditado.
- Auditoría pertenece a la matriz 24B, puede quedar bajo retención legal y no se conserva indefinidamente por omisión; al anonimizar se mantiene sólo la constancia mínima permitida.

### 11.17 Reglas de liberación y piloto aprobadas

- El Anillo 0 usa staging, datos ficticios, las cuatro personas de desarrollo y representantes de coordinación/validación para probar despliegue, migración/restauración, acceso, recorrido de asistencia, jobs, notificaciones, scanner, auditoría y exportaciones.
- El Anillo 1 cubre una sede, una área, 10–25 prestadores, coordinación, jefatura y soporte durante al menos cuatro semanas o 20 días hábiles. Los datos son reales/canónicos, no desechables ni duplicados en el legado.
- El piloto no habilita sólo check-in: incluye `check-in -> check-out/corte -> riesgo -> revisión -> validación -> bolsa -> ausencia/calendario -> auditoría/notificación`. Expediente entra en una segunda etapa cuando almacenamiento/scanner estén listos; Kairos queda fuera.
- El Anillo 2 expande por áreas y luego sedes e incorpora expediente, perfil académico, tableros, exportaciones y directorio. El Anillo 3 prueba Kairos básico con pocos proyectos; sus incidentes no detienen Servicio Social.
- El Anillo 4 habilita visitas, inventario, gamificación e impresión 3D por módulo/alcance después de sus pruebas verticales. Sus fallos pueden deshabilitar el módulo afectado sin detener Servicio Social o Kairos estable.
- Feature flags por entorno, sede, área, usuario, módulo o función se aplican en backend y se reflejan en frontend. Cambiarlos requiere permiso y auditoría.
- Entrada al piloto exige staging estable, pruebas/concurrencia/idempotencia, migración ensayada, restauración, jobs/correo/scanner observables, calendarios/RBAC configurados, capacitación, soporte, responsable de liberación y runbook de reversión.
- No se amplía con pérdida/duplicación de horas, acceso fuera de alcance, auditoría crítica incompleta, jobs duplicados, archivos sin análisis, migración no conciliada o incidente crítico abierto. La salida exige conciliación, ciclos diarios, correcciones/validaciones, notificaciones observables y respaldo restaurado.
- Ante incidente se detiene expansión, se deshabilitan operaciones nuevas cuando proceda, se conserva historial, se corrige/compensa, se revierte la imagen si es compatible y se concilia antes de reanudar. No se revierte destructivamente la base de forma automática.
- Durante Anillo 1 hay revisión diaria de jobs/incidencias, canal único de soporte, clasificación bug/dato/duda/cambio, revisión semanal y decisión explícita de ampliar, extender o detener.

### 11.18 Reglas de gobernanza y cambios aprobadas

- Se conservan cinco funciones: responsable funcional provisional, operativo de Servicio Social, técnico, de liberación y de datos/archivo. La asignación nominal se gestiona fuera del repositorio; el desarrollo usa estos identificadores y no abre otra decisión por falta de nombres.
- El responsable funcional acepta reglas/alcance; el operativo revisa flujos diarios; el técnico decide arquitectura reversible; el de liberación aplica gates/rollback; datos/archivo valida privacidad, conservación y supresión.
- Las decisiones usan ID, problema, opciones, resultado, motivo, consecuencias, aprobador, fecha, impacto y estado `PROPUESTA`, `APROBADA`, `RECHAZADA` o `SUSTITUIDA`. Una modificación crea decisión nueva enlazada, no reescribe el pasado.
- Las solicitudes se clasifican `BUG`, `ACLARACION`, `CAMBIO_FUNCIONAL`, `CAMBIO_TECNICO`, `INCIDENTE` o `NUEVO_ALCANCE`. Cambios funcionales evalúan frontend, backend, datos/migración, permisos, auditoría, pruebas, documentación, piloto, reversión y trabajo desplazado.
- Técnica reversible la decide el responsable técnico. Regla de negocio requiere funcional y revisión operativa. Permisos, privacidad, conservación, horas, datos públicos o migración requieren además al responsable institucional aplicable.
- La decisión 31 ya activa los MVP de inventario, visitas, impresión 3D y gamificación. Sólo ampliar esos MVP o activar otro backlog exige una solicitud futura con impacto, prioridad y aceptación.
- El silencio no aprueba. La función afectada permanece deshabilitada o declarada como supuesto y no entra al piloto; el equipo continúa con trabajo independiente.
- Hay revisión semanal breve y registro escrito. Mensajes informales no sustituyen decisiones. En emergencia, el técnico puede restaurar servicio/deshabilitar una función, preservando datos/auditoría y sometiendo cualquier cambio funcional a revisión posterior.

### 11.19 Reglas de soporte e incidentes aprobadas

- Toda duda, defecto, problema de datos o interrupción entra por un canal único de tickets. Conversaciones paralelas pueden ayudar a diagnosticar, pero la prioridad, responsable, estado, decisiones y cierre se conservan en el ticket canónico.
- `S1_CRITICO` incluye caída total, autenticación indisponible, pérdida/corrupción de horas, acceso no autorizado, validación fuera de alcance, duplicación masiva, exposición de archivos privados, disponibilidad de un archivo no analizado, supresión incorrecta o migración fallida en producción.
- `S2_ALTO` incluye bloqueo de una sede/área, fallo de jobs de corte o notificaciones críticas, imposibilidad de validar/corregir, scanner indisponible con cola detenida o exportaciones operativas atascadas. `S3_MEDIO` afecta casos limitados con alternativa manual. `S4_BAJO_SOLICITUD` agrupa textos, detalles visuales y mejoras y se conduce por control de cambios, no como emergencia.
- En horario de cobertura, el objetivo interno para S1 es reconocer en 15 minutos y mitigar en una hora; para S2, reconocer en una hora y mitigar el mismo día hábil; para S3, reconocer en un día hábil y acordar plan en tres; para S4, clasificar en tres días hábiles. Mitigar significa reducir el daño o recuperar el recorrido esencial, no declarar resuelta la causa raíz.
- La cobertura ordinaria propuesta es de lunes a viernes de 08:00 a 18:00 en `America/Mexico_City` y debe ajustarse explícitamente si la operación real de la sede usa otro horario. No se promete atención 24/7 con el equipo inicial.
- Durante las primeras dos semanas del Anillo 1 existe rotación pasiva con una persona primaria y otra secundaria durante las horas reales en que se registre asistencia. Fuera de la cobertura ordinaria sólo S1 exige atención inmediata; S2–S4 se atienden al reabrir la cobertura.
- Los estados del incidente son `ABIERTO`, `RECONOCIDO`, `INVESTIGANDO`, `MITIGANDO`, `MONITOREANDO`, `RESUELTO` y `CERRADO`. Cambiar severidad, resolver o cerrar exige motivo, responsable y marca de tiempo; reabrir conserva el historial.
- S1 y S2 tienen comunicación inicial, actualizaciones mientras exista afectación y mensaje de recuperación con alcance conocido. Nunca se incluyen contraseñas, tokens, evidencias privadas o datos personales innecesarios en el ticket o los avisos.
- Todo S1 y todo S2 repetido tiene revisión sin culpabilización dentro de dos días hábiles: línea de tiempo, impacto, detección, causa o hipótesis, mitigación, acciones con dueño/fecha y cambios requeridos en pruebas, alertas o runbooks.
- Si el incidente involucra acceso indebido, pérdida, exposición, alteración o supresión de datos, se preserva evidencia y se notifica al responsable institucional de datos/archivo. El equipo técnico contiene el daño, pero no decide por sí solo obligaciones institucionales o comunicaciones externas.
- La persona primaria coordina el incidente; la secundaria sostiene comunicación y relevo; cada frontend/backend diagnostica y corrige su dominio. El responsable técnico dirige la mitigación y el responsable de liberación decide flags o reversión conforme a 26B; ningún integrante oculta o borra evidencia para mejorar métricas.

### 11.20 Reglas de continuidad y recuperación aprobadas

- Los objetivos son requisitos internos de arquitectura y verificación, no una promesa contractual de disponibilidad: RPO limita el retroceso máximo de datos y RTO el tiempo máximo para recuperar el recorrido definido en cada nivel.
- El nivel crítico incluye identidad y alcances, asistencia, horas, correcciones, validaciones, ausencias y auditoría relacionada. Su RPO es de 15 minutos y su RTO completo de 4 horas, incluso si la mitigación S1 debe comenzar antes conforme a 28B.
- El nivel importante incluye expediente, metadatos/archivos privados, notificaciones críticas y configuración. Los metadatos tienen RPO de una hora, los objetos usan redundancia o versionado y el RTO coordinado es de 8 horas dentro de la cobertura operativa.
- El nivel secundario incluye Kairos, biblioteca, tableros, exportaciones y sitio público. Su RPO es de 24 horas y su RTO de un día hábil; nunca desplaza la recuperación de Servicio Social.
- La estrategia inicial usa servicios administrados, recuperación punto en el tiempo para MariaDB, respaldo diario con retención inicial de 30 días, almacenamiento redundante/versionado, imágenes identificables y configuración reproducible. No exige activo-activo ni múltiples regiones en la primera liberación.
- Si la escritura o integridad son inciertas, se detienen las operaciones mutables mediante flags o controles de acceso. Sólo puede mostrarse lectura degradada si la copia consultada es coherente y se identifica visiblemente la hora de última actualización; de lo contrario se muestra indisponibilidad.
- Durante una interrupción de asistencia, el prestador reporta el evento por el canal único y recibe una referencia. Al recuperar el sistema, una persona autorizada lo captura como contingencia con hora reportada, evidencia, motivo y auditoría; permanece pendiente de revisión y no suma horas automáticamente.
- No se importan hojas, mensajes o listas paralelas como horas oficiales sin identificación, deduplicación, resolución individual y evento auditable. La restauración tampoco habilita producción hasta conciliar asistencia, horas, auditoría, archivos y supresiones previas.
- Se ejecuta una restauración completa antes del Anillo 1 y al menos un ejercicio trimestral durante operación. Cada prueba mide punto recuperado, tiempo real, integridad, diferencias, pasos manuales y acciones con responsable/fecha; incumplir un objetivo genera trabajo correctivo y puede impedir ampliar el piloto.
- Backend 1 coordina la restauración y concilia identidad, asistencia, horas y auditoría crítica. Backend 2 restaura objetos, scanner, notificaciones y módulos secundarios. Frontend 1 implementa contingencia de Servicio Social y Frontend 2 los avisos/estados degradados generales; las cuatro personas participan en los simulacros.
- La selección, presupuesto y tiempos del proveedor se gestionan fuera de este plan. El código permanece portable y los objetivos RPO/RTO funcionan como requisitos técnicos cuando exista infraestructura, sin abrir otra decisión funcional en esta fase.

### 11.21 Reglas de accesibilidad aprobadas

- WCAG 2.2 nivel AA es criterio de terminado para cada página y proceso completo incluido en una liberación, tanto en el portal autenticado como en el sitio público. Es un objetivo técnico verificable, no una afirmación de certificación legal externa.
- Se priorizan HTML semántico y controles nativos. Cada página tiene título y encabezado principal descriptivos, regiones reconocibles, enlace para saltar al contenido y anuncios comprensibles al cambiar de ruta o estado; ARIA complementa, no sustituye, la semántica correcta.
- Todo recorrido puede completarse con teclado, con foco visible, orden lógico y retorno predecible al cerrar diálogos. Menús, filtros, tablas, cargas, bandejas, confirmaciones y el futuro Kanban no pueden depender únicamente de arrastrar, apuntar o mantener pulsado.
- Cada campo tiene etiqueta, instrucciones y errores relacionados programáticamente. Los errores explican qué ocurrió y cómo corregirlo; correcciones, validaciones masivas y acciones irreversibles presentan alcance y confirmación sin depender de color o códigos internos.
- El semáforo conserva texto/código explicable además del color. Texto, controles, estados y foco cumplen contraste AA; la interfaz admite zoom de 200 %, reflujo en anchos pequeños, controles táctiles suficientes y preferencia de movimiento reducido.
- Cambios dinámicos relevantes se anuncian sin interrumpir innecesariamente. El vencimiento por inactividad avisa y permite conservar la sesión dentro del límite absoluto aprobado de ocho horas; no se reducen las protecciones de seguridad para simular accesibilidad.
- La carga, análisis, consulta y descarga de archivos deben ser accesibles. Ares exige alternativa textual para imágenes institucionales y contenido propio, pero distingue la accesibilidad de la plataforma de la de un PDF/DOCX aportado por terceros, que no puede certificarse automáticamente.
- La verificación combina `eslint-plugin-jsx-a11y`, análisis automatizado de componentes/páginas y pruebas manuales de teclado, foco, contraste, zoom, reflujo y mensajes dinámicos. Se prueba con Firefox/NVDA en Windows y, cuando la matriz 30.1 incluya Apple, con Safari/VoiceOver; la automatización no sustituye la evaluación humana.
- Una barrera que impida completar check-in, check-out, justificación, validación, recuperación de acceso u otro recorrido P0 es bloqueante. Las excepciones se documentan por criterio, impacto, alternativa, responsable y fecha; no se instala un overlay como sustituto de corregir el producto.
- Frontend 1 valida los recorridos completos de Servicio Social. Frontend 2 mantiene la base de navegación/componentes y valida Kairos/sitio público. Ambos realizan revisión cruzada; Backend 1 y Backend 2 entregan estados y errores estructurados que permitan comunicar el resultado de forma comprensible.

### 11.22 Reglas de compatibilidad y conectividad aprobadas

- La aplicación soporta Chrome, Edge, Firefox y Safari en escritorio y móvil. Se prueban la versión estable y las dos versiones mayores anteriores, sin bajar del piso técnico de Next.js 16: Chrome/Edge/Firefox 111 y Safari 16.4.
- Se cubren Windows y macOS con navegador soportado, Android con Chrome soportado e iPhone/iPad con Safari soportado. No se soportan Internet Explorer, navegadores legacy, webviews embebidos ni modificaciones que bloqueen JavaScript, cookies o capacidades esenciales.
- La UI es adaptable desde 320 px CSS hasta escritorio, funciona con teclado, ratón y táctil y no requiere aplicación nativa. Ubicación y cámara son permisos opcionales; denegarlos no bloquea asistencia y aplica las señales informativas de 17B.
- Ares es online-first. Check-in, check-out, validaciones, movimientos, entradas/salidas, puntos y demás operaciones oficiales sólo muestran éxito después de recibir ID, hora/versión y estado confirmados por el servidor.
- Cada escritura crítica usa idempotencia. Si se pierde la respuesta, frontend muestra `RESULTADO_DESCONOCIDO`, consulta la operación por su clave/estado y sólo ofrece reintento cuando sea seguro; nunca crea un segundo registro por asumir que el primero falló.
- Sin conexión no se fabrica una hora local ni se encola un check-in oficial. El prestador usa el procedimiento 29B y la posterior captura queda pendiente de revisión. No se incorpora PWA offline ni sincronización de mutaciones en el MVP.
- La interfaz distingue enviando, confirmado, sin conexión, tiempo agotado y resultado desconocido. Formularios no sensibles pueden conservarse durante la pestaña actual; contraseñas, TOTP, evidencias y datos sensibles no se guardan persistentemente para simular operación offline.
- Las cargas muestran progreso y permiten reintentar sin duplicar versiones. Una carga incompleta no crea un archivo disponible y sigue las reglas de cuarentena 23B.
- CI prueba recorridos críticos en Chromium y pruebas de humo en Firefox/WebKit; antes de cada liberación se realizan pruebas manuales en Android y iPhone/iPad disponibles, incluyendo desconexión, latencia, respuesta perdida, reintento y carga interrumpida.
- Un navegador fuera de matriz recibe un aviso útil y puede acceder al canal de soporte cuando la representación básica lo permita. Los datos observados del piloto pueden justificar ampliar la matriz, pero no abren una decisión previa al desarrollo.

### 11.23 Cierre de alcance y módulos MVP obligatorios

- Con 30.1B y esta instrucción de cierre no quedan decisiones funcionales abiertas para iniciar la implementación. Presupuesto/proveedor, nombres institucionales, calendarios reales, plazos externos y fuentes heredadas se gestionan fuera de este plan y no generan rondas adicionales de aprobación aquí.
- Gamificación, inventario, visitas e impresión 3D son P3/Incremento 5 obligatorios. Cada uno debe entregar modelo, migración, permisos, API/OpenAPI, UI adaptable/accesible, pruebas, auditoría y estados de error; una ruta vacía, tarjeta estática o dato simulado no satisface el requisito.
- **Gamificación mínima:** usa un libro append-only de eventos de puntos, nivel derivado e insignias limitadas. Sólo una actividad Kairos `TERMINADA` y aprobada, o un reconocimiento manual autorizado con motivo, puede otorgar puntos. La concesión es idempotente y una corrección crea reverso, no edita el evento. El usuario ve sólo su perfil/historial; administración gestiona reglas e insignias. Asistencia, puntualidad y horas no dan XP; no hay ranking público, rachas, monedas, tienda o recompensas.
- **Inventario mínimo:** separa `CONSUMIBLE` y `ACTIVO`, define ubicación y conserva movimientos `ENTRADA`, `SALIDA`, `AJUSTE`, `PRESTAMO` y `DEVOLUCION`. Consumibles usan cantidad/unidad; activos usan identificador único y estado. Las existencias se derivan de movimientos y no se editan directamente. Préstamos registran receptor, entrega, vencimiento opcional y devolución. No incluye compras, proveedores, costos, depreciación, contabilidad o ERP.
- **Visitas mínimas:** un anfitrión interno crea invitación privada, revocable y temporal con datos mínimos de visitante, propósito y alcance. El visitante no obtiene cuenta. El QR contiene un identificador opaco y nunca autoriza por sí solo; personal con permiso confirma entrada y salida. Estados: `EMITIDA`, `REGISTRADA_ENTRADA`, `REGISTRADA_SALIDA`, `VENCIDA` y `CANCELADA`. No hay solicitud pública, preregistro anónimo ni control físico de puertas.
- **Impresión 3D mínima:** un solicitante crea `TrabajoImpresion3D` con descripción y un STL privado sujeto a cuarentena/análisis estructural. Estados: `SOLICITADO`, `EN_REVISION`, `APROBADO`, `EN_COLA`, `EN_IMPRESION`, `COMPLETADO`, `RECHAZADO`, `CANCELADO` y `FALLIDO`. Un operador asignado registra ejecuciones separadas con inicio/fin, material, peso opcional, resultado y observación. No incluye laminado, control de impresora, cotización/cobro, marketplace o soporte 3MF inicial.
- Los cuatro módulos usan alcance backend y permisos separados: consulta/gestión de gamificación, consulta/movimiento/préstamo de inventario, invitación/control de visitas y solicitud/operación 3D. Acciones sensibles generan auditoría y notificaciones sólo cuando sean accionables.
- Frontend 1 y Backend 1 son responsables de visitas e inventario. Frontend 2 y Backend 2 son responsables de gamificación e impresión 3D. Se construyen después de sus dependencias P0–P2 y se habilitan en Anillo 4 mediante feature flags independientes.
- 8B, 11B, 12B y 13B permanecen como historial. La decisión 31 sustituye únicamente su aplazamiento/condición y conserva sus límites de seguridad y simplificación.

## 12. Próximo paso recomendado

El contrato funcional principal ya produjo el primer recorrido backend implementable. El orden recomendado desde este corte es:

**Decisiones funcionales pendientes: ninguna.** Las decisiones externas al control del repositorio se omiten de esta secuencia y se resolverán por separado cuando corresponda; no bloquean los contratos ni la implementación local.

1. Implementar en Backend 1 el job idempotente de corte de las 23:59 y la corrección autorizada con motivo, versión esperada y separación de funciones.
2. Añadir consulta jerárquica por alcance, bandeja de sesiones anormales y pruebas explícitas para `area`, `sede` y `global`.
3. Implementar validación individual y autorización masiva verde de máximo 100, seguidas por la bolsa de horas derivada de decisiones inmutables.
4. Permitir que Frontend 1 integre ya `check-in`, `check-out`, sesión actual e historial propio desde el OpenAPI vigente, sin replicar el cálculo de riesgo.
5. Continuar después con ausencias/calendario; en paralelo se mantienen los carriles ya asignados a Backend 2 y Frontend 2.

Backend 1 ya comenzó el Incremento 1 y debe cerrar corte/corrección antes de abrir visitas o inventario. Frontend 1 puede consumir el corte propio actual mientras Backend 1 continúa el flujo. En paralelo, Backend 2 puede preparar almacenamiento/documentos y Frontend 2 los componentes de estados y navegación de Kairos. Los cuatro MVP P3 siguen comprometidos, pero comienzan después de estabilizar sus dependencias y no desplazan el núcleo de Servicio Social.

## 13. Referencias del repositorio actual

- Arquitectura y operación: [`../README.md`](../README.md)
- Decisiones de fase inicial: [`../backend/docs/phase-0-decisions.md`](../backend/docs/phase-0-decisions.md)
- Matriz RBAC: [`../backend/docs/rbac.md`](../backend/docs/rbac.md)
- Contrato backend de asistencia: [`../backend/docs/attendance-contract.md`](../backend/docs/attendance-contract.md)
- Modelo vigente: [`../backend/prisma/schema.prisma`](../backend/prisma/schema.prisma)
- Módulos backend: [`../backend/src/app.module.ts`](../backend/src/app.module.ts)
- Permisos backend: [`../backend/src/auth/permissions.ts`](../backend/src/auth/permissions.ts)
- Contrato OpenAPI: [`../backend/src/openapi/openapi.document.ts`](../backend/src/openapi/openapi.document.ts)
- Tipos frontend: [`../frontend/lib/types.ts`](../frontend/lib/types.ts)
- Permisos frontend: [`../frontend/lib/permissions.ts`](../frontend/lib/permissions.ts)
- CI: [`../.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- Entorno Docker: [`../compose.yaml`](../compose.yaml)

## 14. Referencias documentales heredadas

- `Docs-Ares.pdf`, 4 páginas: plan de migración, prioridades, matriz de roles y mapa funcional.
- `GestionSS-Ares_Documentacion.pdf`, 132 páginas: análisis técnico del sistema heredado. Las secciones más relevantes para esta comparación son resumen ejecutivo (páginas 10-13), dominio (34-55), rutas (56-66), API (67-85), autenticación y permisos (86-96), flujos (97-102), operación (103-111), testing y deuda (112-123), glosario y preguntas abiertas (124-132).
- `REPORTE TÉCNICO ESTADO INTEGRAL DEL SISTEMA ARES.pdf`, 9 páginas, fechado el 14 de enero de 2026: avance declarado, entorno, módulos considerados operativos, hoja de ruta y riesgos. Contiene credenciales expuestas que no deben reutilizarse.
- `DOCUMENTO TECNICO - ARES.pdf`, 10 páginas, fechado el 11 de marzo de 2026: alcance declarado como entregado, inventario aproximado de API, dominios, seguridad, base de datos y pendientes post-entrega.
- `MANUAL DE USUARIO - ARES.pdf`, 12 páginas, fechado el 11 de marzo de 2026: capacidades por rol y recorridos operativos de asistencia, documentos, Kairos, administración e incidencias.

Estas referencias no demuestran que una capacidad exista en el repositorio actual. Explican el comportamiento y los riesgos que deben confirmarse antes de reconstruirla; las rutas, porcentajes, fechas y decisiones técnicas del sitio viejo no se trasladan automáticamente.
