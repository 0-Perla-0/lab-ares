# Contexto, estado de desarrollo y plan de trabajo de Ares

## Ficha de corte

| Dato                        | Valor                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Fecha de revisión           | 24 de agosto de 2026                                                                                              |
| Rama de trabajo             | `features/docs/contexto-estado-ares`                                                                              |
| Commit base revisado        | `985536c` (`develop`)                                                                                             |
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

Ares ya cuenta con una base administrativa sólida y verificable, pero todavía no es funcionalmente equivalente al sistema documentado. El desarrollo actual cubre infraestructura, autenticación con sesiones, autorización centralizada, usuarios y catálogos de organización. No cubre aún los dos grandes núcleos operativos del producto: **Servicio Social** y **Kairos**.

El siguiente objetivo no debería ser migrar pantallas aisladas. Debe construirse primero un recorrido vertical completo de Servicio Social:

`check-in -> check-out -> bolsa de horas -> validación -> faltas/calendario -> documentos`

Después puede abordarse Kairos en este orden:

`proyecto -> miembros -> actividades -> evidencia -> validación -> Kanban`

Varias capacidades del legado no deben entrar automáticamente al alcance. Gamificación, tienda, impresión 3D, inventario, visitas, capacitación RV, subtareas, comentarios, generaciones y centros universitarios requieren confirmación o fueron clasificadas como backlog en el plan de migración.

No se asigna un porcentaje global de avance porque daría el mismo peso a una pantalla de catálogo que al flujo completo de asistencia. La lectura correcta es:

- **Base técnica y administración inicial:** implementadas.
- **Operación de Servicio Social:** pendiente.
- **Kairos:** pendiente.
- **Funciones secundarias o experimentales:** pendientes de decisión o pospuestas.

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

> **Alerta de seguridad:** el reporte de enero contiene credenciales y contraseñas en texto claro. No se reproducen en este documento. Deben considerarse comprometidas, rotarse si aún existen y excluirse de cualquier migración, issue o dato de prueba nuevo.

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

### 3.4 Frontend disponible

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

### 3.5 Backend y calidad

El backend expone 27 operaciones HTTP si se cuentan salud, autenticación, OpenAPI, organización y usuarios. El esquema actual contiene seis modelos Prisma: `Sede`, `Area`, `Turno`, `TurnoDia`, `Usuario` y `Session`.

En esta revisión se ejecutó la suite no integrada del backend:

- 20 archivos de prueba aprobados.
- 142 pruebas aprobadas.
- Cobertura funcional de autenticación, permisos, sesiones, usuarios, organización, OpenAPI, configuración, salud y bootstrap.

Existe además una suite de integración con MariaDB. El frontend todavía no tiene pruebas automatizadas propias; sólo cuenta con validación de tipos, formato y build dentro del flujo de calidad.

### 3.6 Diferencia entre el sitio viejo y la reconstrucción

| Aspecto          | Sitio viejo documentado                                                                                                           | Reconstrucción actual                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Arquitectura     | Next.js 15 monolítico: páginas, endpoints y dominio en el mismo proyecto                                                          | Next.js 16 para UI y NestJS 11 como backend independiente                              |
| Autenticación    | NextAuth 5 con JWT, middleware y verificaciones distribuidas                                                                      | Sesión persistente server-side, cookie HTTP-only y guards globales NestJS              |
| Acceso a datos   | Prisma 6 desde rutas y utilidades del monolito                                                                                    | Prisma 7 encapsulado en repositorios/servicios del backend                             |
| Alcance de datos | Decenas de modelos para asistencia, documentos, Kairos, gamificación, laboratorio y contenido                                     | Seis modelos para organización, usuarios y sesiones; los demás dominios aún no existen |
| API              | Aproximadamente 103 archivos `route.ts` reportados, con duplicados y endpoints sin consumidor detectados por el análisis integral | 27 operaciones HTTP intencionales y documentadas en OpenAPI para el alcance actual     |
| Calidad          | El documento de marzo menciona Jest/ESLint; el análisis integral encontró pruebas y CI inefectivos                                | Vitest, pruebas unitarias/E2E/integración, typecheck, build y CI                       |
| Despliegue       | Desarrollo local y previews de Vercel; sin evidencia consistente de producción estable                                            | Docker Compose y CI reproducibles; staging/producción siguen por definir               |

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

| Dominio o módulo                | Expectativa recuperada del legado                                                           | Estado actual                                                | Falta principal                                                                                                           | Prioridad recomendada |
| ------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Infraestructura base            | Aplicaciones desplegables, base persistente, variables seguras y CI                         | Implementado en local/CI                                     | Definir staging/producción, observabilidad y política operativa; no heredar la configuración NextAuth/Vercel del monolito | Mantenimiento         |
| Autenticación                   | Login, registro opcional, activación administrativa, perfil, foto y preferencias            | Parcial                                                      | Decidir autorregistro/recuperación; implementar activación, perfil propio y administración de sesiones si se conservan    | P1                    |
| Roles y permisos                | Seis roles de plataforma y permisos por operación/alcance                                   | Implementado para módulos actuales                           | Extender permisos por dominio, incluyendo cierre manual, validaciones masivas, auditoría y Kairos                         | P0 transversal        |
| Usuarios                        | CRUD, aprobación, estados, baja segura y cambios sensibles auditados                        | Parcial avanzado                                             | Flujo de activación/rechazo, historial de email/rol/credenciales, perfil académico y filtros/paginación                   | P1                    |
| Sedes, áreas y turnos           | Organización multinivel; documentos nuevos añaden centros y carreras                        | Implementado en su alcance base                              | Confirmar centros universitarios, carreras/generaciones y reglas de turnos nocturnos                                      | P1 de decisión        |
| Auditoría transversal           | Quién cambió, aprobó o rechazó qué y cuándo                                                 | Pendiente                                                    | Modelo y servicio común para usuarios, organización, asistencia, documentos y Kairos; consulta administrativa             | P0                    |
| Check-in/check-out              | Una sesión abierta, cierre propio, cierre manual autorizado y alertas de sesiones anormales | Pendiente                                                    | Modelos, endpoints, UI, hora del servidor, idempotencia, concurrencia, motivo de cierre manual y alertas                  | P0                    |
| Bolsa de horas y riesgo         | Horas autorizadas, pendientes y rechazadas; semáforo verde/amarillo/rojo                    | Pendiente                                                    | Política de cálculo, umbrales aceptados, saldo, comentarios del validador e historial inmutable                           | P0                    |
| Validación de horas             | Revisión individual y masiva, filtros por sede/área/usuario/estado y rechazo comentado      | Decisión requerida                                           | Elegir v1/v2, definir cuándo se permite acción masiva y preservar autoridad por alcance                                   | P0                    |
| Faltas                          | Cálculo por ausencia, consulta, justificación con soporte y resolución                      | Pendiente                                                    | Generación, adjuntos, revisión, estados y relación con asistencia/calendario                                              | P0                    |
| Calendario y excepciones        | Festivos, vacaciones, suspensiones y posibles ajustes manuales de horas                     | Pendiente                                                    | Catálogo, reglas de exclusión, permisos y decisión sobre regalos/ajustes manuales                                         | P0                    |
| Jobs de cierre, faltas y avisos | Cierre automático, aviso de cierre y cálculo diario de faltas                               | Pendiente                                                    | Scheduler real, idempotencia, bloqueo, reintentos, notificaciones efectivas, métricas y logs                              | P0                    |
| Documentos del prestador        | Carga y revisión con estados `PENDIENTE -> EN_REVISION -> AUTORIZADO/RECHAZADO`             | Pendiente                                                    | S3/MinIO, metadatos, retroalimentación, versionado, PDF/JPG/PNG, límites, autorización y análisis de archivos             | P1                    |
| Documentación de coordinadores  | Sustituir directorios, manuales y bitácoras operadas en Excel                               | Pendiente                                                    | Definir tipos, propietarios, visibilidad, edición y si pertenece al módulo documental                                     | P2 de decisión        |
| Kairos - proyectos              | Nombre, descripción, prioridad, estado, miembros, favoritos y reportes                      | Pendiente                                                    | Modelo canónico, API autorizada, pantallas y alcance por proyecto                                                         | P1                    |
| Kairos - miembros               | Roles `DUEÑO`, `SUBLÍDER`, `COLABORADOR` y `OBSERVADOR`                                     | Pendiente                                                    | Invitación/asignación, matriz de acciones y compatibilidad con roles globales                                             | P1                    |
| Kairos - actividades            | Título, descripción, fechas, complejidad, asignados, estado, duplicado y movimiento         | Pendiente                                                    | CRUD, transiciones, reasignación, trazabilidad al mover entre proyectos y validación                                      | P1                    |
| Evidencias Kairos               | Archivos y comentarios con revisión e historial                                             | Pendiente                                                    | Almacenamiento, autorización, versión, retroalimentación y vínculo inequívoco con actividad                               | P1                    |
| Kairos - Kanban                 | Carriles `PENDIENTES -> REVISADOS -> EN_PROCESO -> TERMINADO`                               | Pendiente                                                    | Confirmar esos estados, reglas de movimiento y evidencia mínima; construir sobre actividades estables                     | P2                    |
| Gamificación y XP               | XP base por calidad, nivel, racha, monedas y progreso                                       | Decisión requerida con evidencia fuerte de uso legado        | Confirmar permanencia y reglas; aislar cálculo para no duplicarlo entre asistencia y Kairos                               | P2 condicionada       |
| Insignias y ranking             | Logros, medallas y clasificación                                                            | Decisión requerida con evidencia fuerte de uso legado        | Confirmar privacidad, desempates, periodicidad y cálculo                                                                  | P2 condicionada       |
| Tienda y recompensas            | Canje de monedas, catálogo, stock y carrito                                                 | Decisión requerida                                           | El propio reporte de enero la marcaba pendiente; validar necesidad y modelo de negocio                                    | P3 condicionada       |
| Monitoreo y reportes            | Pendientes por módulo, sesiones abiertas, ocupación, tiempos de validación y Excel/CSV      | Pendiente                                                    | Definir métricas, permisos, exportaciones, anonimización y costo de consulta                                              | P2                    |
| Directorio público              | Consulta de contactos autorizados                                                           | Pendiente                                                    | Contrato de datos públicos, privacidad, búsqueda y UI                                                                     | P2                    |
| Sitio público                   | Landing, FAQ, contacto y contenido institucional                                            | Parcial                                                      | Ya hay landing; confirmar qué secciones heredadas deben reconstruirse                                                     | P3                    |
| Solicitud de impresión 3D       | Solicitud y seguimiento                                                                     | Decisión requerida                                           | Elegir un único modelo y flujo entre variantes heredadas                                                                  | P2 condicionada       |
| Bitácora de impresión 3D        | Tiempo, peso, material y archivo STL                                                        | Decisión requerida                                           | Unificar duplicados y relacionar solicitud, seguimiento, insumos y autorización                                           | P2 condicionada       |
| Inventario                      | Catálogo del laboratorio                                                                    | Pospuesto                                                    | El análisis integral detectó UI mock y el documento de marzo lo mantiene como pendiente; tratar como feature nueva        | Backlog               |
| Visitas                         | Registro público, aprobación y control de entrada/salida                                    | Estado legado contradictorio; no existe en la reconstrucción | Resolver si el flujo llegó a operar y definir contrato completo antes de estimar                                          | Backlog               |
| Subtareas y comentarios Kairos  | Desglose, menciones y colaboración                                                          | Pospuesto                                                    | Existían modelos o intención, sin recorrido confiable confirmado                                                          | Backlog               |
| Capacitación RV                 | Contenido de capacitación                                                                   | Pospuesto                                                    | No se detectó uso; confirmar antes de diseñar                                                                             | Backlog               |
| Modelos legacy duplicados       | Mantener variantes históricas                                                               | No migrar                                                    | Diseñar modelos canónicos en el nuevo dominio                                                                             | Fuera de alcance      |

### 5.1 Contratos funcionales recuperados para validación

Estos contratos son más específicos que el primer plan de migración. Deben convertirse en criterios de aceptación sólo después de validarlos con producto:

**Asistencia y validación**

- El prestador no puede iniciar una segunda sesión mientras exista una abierta.
- El cierre normal muestra duración y estado de horas.
- Coordinadores o jefaturas pueden cerrar una sesión anormal y deben registrar una observación.
- Los validadores filtran por sede, área, usuario y estado; aprobar/rechazar exige revisar check-in, check-out y duración.
- La validación masiva sólo procede cuando una regla uniforme aplica a todo el conjunto.
- La bolsa distingue horas pendientes, autorizadas y rechazadas, y conserva comentarios del validador.

**Faltas, calendario y documentos**

- Una falta puede justificarse con texto y soporte adjunto, y debe mostrar el resultado de revisión.
- Festivos, vacaciones y suspensiones excluyen o modifican el cálculo según una política explícita.
- Los documentos del prestador siguen `PENDIENTE -> EN_REVISION -> AUTORIZADO/RECHAZADO` y un rechazo incluye retroalimentación.

**Kairos**

- Los roles internos candidatos son `DUEÑO`, `SUBLÍDER`, `COLABORADOR` y `OBSERVADOR`; no sustituyen el rol global del usuario.
- Una actividad contiene título, descripción, fechas, complejidad y asignados.
- Los carriles candidatos son `PENDIENTES`, `REVISADOS`, `EN_PROCESO` y `TERMINADO`.
- Mover o duplicar actividades, incluso entre proyectos, conserva comentario e historial de trazabilidad.
- Las evidencias incluyen archivo y comentario contextual, y deben aparecer en el historial de la actividad.

## 6. Funcionalidades faltantes por prioridad

### P0 - completar el núcleo de Servicio Social

1. Cerrar decisiones de negocio de asistencia:
   - Versión de validación de horas.
   - Umbrales del semáforo de riesgo y condiciones de validación masiva.
   - Uso o no de geolocalización e IP.
   - Tolerancias de entrada y salida.
   - Turnos nocturnos.
   - Autoridad y motivo obligatorio para cierre manual.
   - Reglas para festivos, vacaciones y suspensiones.
2. Añadir modelos y migraciones de asistencia, autorizaciones de horas, bolsa de horas, faltas y excepciones de calendario.
3. Implementar check-in/check-out transaccionales, idempotentes y basados en hora del servidor, más cierre manual auditado.
4. Implementar consulta propia, consulta jerárquica y detección de sesiones abiertas anormales.
5. Implementar validación individual/masiva con filtros por sede, área, usuario y estado.
6. Implementar faltas, justificaciones con soporte y cálculo automático observable.
7. Implementar jobs de cierre, aviso y faltas con notificaciones reales o un mecanismo de entrega explícitamente diferido.
8. Añadir auditoría de cambios sensibles desde el inicio.
9. Extender OpenAPI, Postman y pruebas por cada recorrido.

### P1 - documentos y Kairos esencial

1. Crear una abstracción S3-compatible y usar MinIO en local.
2. Implementar subida, descarga, revisión, retroalimentación y autorización de documentos con los estados recuperados.
3. Implementar proyectos Kairos y miembros con roles internos separados del rol global y autorización server-side.
4. Implementar actividades, asignaciones, estados, duplicado/movimiento y evidencias trazables.
5. Agregar paginación y filtros a listados que puedan crecer.
6. Incorporar pruebas automatizadas frontend para los recorridos críticos.

### P2 - experiencia operativa y módulos de apoyo

1. Kanban de Kairos sobre el modelo de actividades ya estabilizado y con carriles aceptados.
2. Monitoreo ejecutivo y reportes/exportaciones con permisos y límites.
3. Documentación operativa de coordinadores y directorio público con reglas explícitas de privacidad.
4. Impresión 3D, sólo después de elegir el modelo canónico.
5. Gamificación, XP, insignias y ranking, sólo después de confirmación de producto.

### Backlog condicionado

- Tienda y recompensas.
- Inventario.
- Visitas, después de resolver la contradicción entre las fuentes heredadas.
- Subtareas y comentarios Kairos.
- Capacitación RV.
- Generaciones y centros universitarios.
- Secciones institucionales adicionales del sitio público.

## 7. Secuencia recomendada de entrega

### Incremento 0 - decisiones y contratos

- Aceptar reglas de asistencia y la versión de validación.
- Aceptar umbrales de riesgo, reglas de cierre manual y validación masiva.
- Definir estados y transiciones de asistencia, documentos y Kairos usando los contratos recuperados como propuesta.
- Acordar la matriz de permisos ampliada.
- Preparar modelos, contratos OpenAPI y criterios de aceptación antes de construir UI.

### Incremento 1 - asistencia vertical

- Check-in/check-out.
- Cierre manual auditado y alertas de sesiones anormales.
- Consulta de asistencia propia.
- Bolsa de horas.
- Pruebas de idempotencia, concurrencia, alcance y turnos.

### Incremento 2 - validación, faltas y documentos

- Bandejas de validación.
- Calendario y excepciones.
- Faltas, justificaciones con soporte y scheduler de cierre/aviso/cálculo.
- Carga y revisión de documentos con estados y retroalimentación.

### Incremento 3 - Kairos base

- Proyectos y miembros con roles internos.
- Actividades, asignaciones, duplicado/movimiento y transiciones.
- Entrega, comentarios y revisión trazable de evidencias.

### Incremento 4 - Kairos visual y módulos confirmados

- Kanban con carriles y reglas de movimiento aceptadas.
- Monitoreo y reportes.
- Directorio.
- Impresión 3D y gamificación únicamente si fueron aceptados.

Cada incremento debe cerrar frontend, backend, migración, permisos, OpenAPI, pruebas y observabilidad básica. No se recomienda declarar terminada una fase si sólo existen pantallas o sólo existen endpoints.

## 8. Separación de actividades para cuatro personas

Como no se proporcionaron nombres, se usan identificadores de rol. El reparto sigue dominios verticales para reducir dependencias y conflictos de archivos.

### Frontend 1 - Servicio Social

**Propiedad principal:** recorridos del prestador y validadores.

- Crear navegación y rutas de asistencia.
- Implementar estado actual, check-in y check-out.
- Implementar historial, bolsa de horas, semáforo de riesgo y comentarios de validación.
- Construir bandejas individual/masiva, filtros y cierre manual de sesiones con observación.
- Implementar faltas, justificaciones con soporte, calendario y excepciones visibles según rol.
- Implementar carga, retroalimentación y estados de documentos del prestador cuando el contrato backend esté listo.
- Crear pruebas de componentes y recorridos críticos de Servicio Social.
- Asegurar estados vacíos, errores, carga, accesibilidad y comportamiento adaptable.

**Áreas sugeridas:** `frontend/app/portal/asistencia/`, `frontend/app/portal/validaciones/`, `frontend/app/portal/documentos/`, `frontend/components/attendance/` y `frontend/components/documents/`.

### Frontend 2 - Kairos y módulos de apoyo

**Propiedad principal:** experiencia de proyectos colaborativos.

- Crear rutas de proyectos y detalle de proyecto.
- Implementar alta/edición de proyecto y gestión de miembros con roles internos.
- Implementar actividades, responsables, estados, duplicado/movimiento y entrega de evidencia.
- Construir el Kanban después de estabilizar las transiciones y confirmar los cuatro carriles candidatos.
- Mantener historial visible al mover actividades y al agregar comentarios/evidencias.
- Implementar directorio e impresión 3D si esas capacidades son aprobadas.
- Preparar gamificación, insignias y ranking sólo con reglas aceptadas.
- Crear pruebas de componentes y recorridos críticos de Kairos.
- Extraer componentes reutilizables de tablas, filtros, paginación y carga de archivos sin cambiar el diseño global unilateralmente.

**Áreas sugeridas:** `frontend/app/proyectos/`, `frontend/components/kairos/`, `frontend/app/directorio/` y `frontend/components/print3d/`.

### Backend 1 - Asistencia, horas y faltas

**Propiedad principal:** núcleo transaccional de Servicio Social.

- Diseñar modelos y migraciones de asistencia, bolsa de horas, autorizaciones, faltas y calendario.
- Implementar check-in/check-out con hora de servidor, idempotencia, transacción, una sola sesión abierta y cierre manual auditado.
- Encapsular el cálculo de bolsa y semáforo de riesgo detrás de una política.
- Implementar la variante de validación aceptada, incluida la acción masiva condicionada, sin acoplarla al contrato HTTP.
- Implementar faltas, justificaciones con adjuntos y excepciones.
- Implementar jobs de cierre, aviso y faltas con bloqueo, reintentos, idempotencia, notificaciones y métricas/logs.
- Aplicar permisos `self`, `area`, `sede` y `global`.
- Mantener OpenAPI, pruebas unitarias, E2E e integración del dominio.

**Áreas sugeridas:** `backend/src/attendance/`, `backend/src/hours/`, `backend/src/absences/` y `backend/src/calendar/`.

### Backend 2 - Documentos, Kairos y almacenamiento

**Propiedad principal:** colaboración y archivos.

- Crear la abstracción de almacenamiento S3-compatible y configuración local de MinIO.
- Diseñar documentos, retroalimentación, estados recuperados y autorización de descarga.
- Diseñar proyectos Kairos y miembros con relaciones canónicas y roles internos distintos al rol global.
- Implementar actividades, asignaciones, evidencia, comentarios, duplicado/movimiento y transiciones de estado.
- Garantizar autorización server-side en cada lectura y escritura de Kairos.
- Añadir soporte backend de Kanban como vistas/consultas sobre actividades, no como un dominio duplicado.
- Implementar impresión 3D y directorio sólo cuando sus contratos estén aceptados.
- Mantener OpenAPI, pruebas unitarias, E2E e integración de sus dominios.

**Áreas sugeridas:** `backend/src/storage/`, `backend/src/documents/`, `backend/src/kairos/`, `backend/src/directory/` y `backend/src/print3d/`.

### Responsabilidades compartidas y regla de integración

| Archivo o decisión compartida                 | Responsable por cambio                                | Regla                                                                                 |
| --------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `backend/prisma/schema.prisma`                | Backend dueño del incremento                          | Una migración pequeña y revisable por dominio; coordinar nombres antes de editar.     |
| `backend/src/app.module.ts`                   | Backend que incorpora el módulo                       | PR corto de integración después de aprobar el módulo.                                 |
| `backend/src/auth/permissions.ts`             | Backend dueño del dominio                             | Todo permiso nuevo requiere prueba de matriz y alcance.                               |
| `backend/src/openapi/openapi.document.ts`     | Backend dueño del endpoint                            | Actualizar en la misma entrega, no al final del proyecto.                             |
| `frontend/components/portal/portal-shell.tsx` | Frontend dueño del incremento                         | Integrar navegación en cambios pequeños para evitar conflictos.                       |
| `frontend/lib/types.ts`                       | Frontend consumidor del contrato                      | Preferir tipos por dominio cuando crezca; no duplicar enums con nombres alternativos. |
| Diseño y componentes UI                       | Frontend 1 y Frontend 2                               | Acordar la interfaz del componente antes de extraerlo como compartido.                |
| Auditoría transversal                         | Backend 1 diseña base; Backend 2 integra sus dominios | El servicio común se define una vez y cada módulo registra eventos propios.           |

## 9. Dependencias entre personas

| Entrega                | Backend requerido | Frontend consumidor | Condición para iniciar UI funcional                                              |
| ---------------------- | ----------------- | ------------------- | -------------------------------------------------------------------------------- |
| Check-in/check-out     | Backend 1         | Frontend 1          | Estados, errores, idempotencia y reglas de cierre manual definidos               |
| Bolsa y validación     | Backend 1         | Frontend 1          | Política de riesgo, validación masiva y contrato OpenAPI aceptados               |
| Faltas/calendario      | Backend 1         | Frontend 1          | Reglas de exclusión, soportes, scheduler y avisos aceptados                      |
| Documentos             | Backend 2         | Frontend 1          | Estados, retroalimentación, límites, tipos y URLs de carga/descarga definidos    |
| Proyectos/miembros     | Backend 2         | Frontend 2          | Roles internos, matriz de permisos y alcance de proyecto aprobados               |
| Actividades/evidencias | Backend 2         | Frontend 2          | Transiciones, trazabilidad de movimiento y reglas de revisión aprobadas          |
| Kanban                 | Backend 2         | Frontend 2          | Actividades estables, carriles y reglas de movimiento/evidencia mínima definidos |

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
- Auditoría para cambios sensibles.
- Acción operativa verificada para cada rol autorizado y denegada para los demás.
- Ninguna credencial heredada reutilizada en código, documentación, seeds o entornos.
- Documentación breve de operación si existe scheduler, almacenamiento o configuración nueva.
- Monitoreo y procedimiento de recuperación para jobs, archivos o notificaciones que puedan fallar fuera de una petición HTTP.

## 11. Decisiones que bloquean o pueden cambiar el alcance

1. ¿Qué documento o responsable decide cuando las fuentes heredadas se contradicen?
2. ¿Qué variante de validación de horas se acepta como regla oficial?
3. ¿Cuáles son los umbrales del semáforo y cuándo se permite validación masiva?
4. ¿Se requiere geolocalización, restricción por IP o tolerancia de horario?
5. ¿Cómo se manejan turnos nocturnos, cierre manual y sesiones abiertas al cierre del día?
6. ¿Se conserva autorregistro, activación administrativa y recuperación de contraseña?
7. ¿Gamificación, XP, insignias, ranking y tienda siguen siendo requisitos?
8. ¿Los roles y carriles de Kairos descritos por el manual son los definitivos?
9. ¿Qué modelo heredado de solicitud y bitácora de impresión 3D es el canónico?
10. ¿Qué información puede publicar el directorio y qué documentos de coordinadores deben digitalizarse?
11. ¿Carreras, generaciones y centros universitarios siguen formando parte de organización?
12. ¿El sistema de visitas llegó a operar y debe reconstruirse?
13. ¿Qué datos del sistema heredado deben migrarse y con qué reglas de limpieza?
14. ¿Cuál será el entorno real de staging/producción y cómo se observarán jobs, errores y salud?
15. ¿Qué canales de notificación y qué reportes/exportaciones son necesarios en la primera liberación?

## 12. Próximo paso recomendado

Antes de repartir tickets de implementación, el equipo debería realizar una sesión corta de aceptación del Incremento 0 y producir cinco resultados:

1. Matriz que marque cada contrato recuperado como aceptado, modificado o descartado.
2. Tabla oficial de estados y transiciones de asistencia.
3. Decisión documentada sobre riesgo, cierre manual y validación individual/masiva.
4. Matriz RBAC ampliada para asistencia, documentos y Kairos.
5. Contratos OpenAPI iniciales de check-in/check-out, asistencia propia, bolsa de horas y validación.

Con esos acuerdos, Backend 1 y Frontend 1 pueden iniciar el Incremento 1, mientras Backend 2 prepara almacenamiento/documentos y Frontend 2 prepara la estructura de Kairos sin inventar contratos.

## 13. Referencias del repositorio actual

- Arquitectura y operación: [`../README.md`](../README.md)
- Decisiones de fase inicial: [`../backend/docs/phase-0-decisions.md`](../backend/docs/phase-0-decisions.md)
- Matriz RBAC: [`../backend/docs/rbac.md`](../backend/docs/rbac.md)
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
