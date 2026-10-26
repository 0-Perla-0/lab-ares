# Aprobaciones externas para la entrega

Lista de verificación de decisiones que **ninguna persona del equipo de desarrollo puede tomar** y que bloquean activar o aceptar una función.
Cada punto se marca sólo con evidencia externa (acta, ticket, correo institucional) anotada en `Ref.`; un test verde no aprueba nada.
No se inventan plazos, destinatarios, festivos, correos ni tratamientos: si no hay decisión, la función queda apagada.
Detalle técnico en la feature enlazada. [Índice](index.md) · [Flujo SDD](sdd/README.md) · [Memoria](../MEMORY.md).

Autoridades que deben nombrarse antes de empezar (ver [entrega](sdd/entrega/spec.md) T5):

- [ ] Autoridad **funcional** (qué hace el servicio social). Ref.: ______
- [ ] Autoridad **operativa** (soporte, capacitación, guardia). Ref.: ______
- [ ] Autoridad **técnica** (infraestructura, claves, restauración). Ref.: ______
- [ ] Autoridad de **datos** (retención, privacidad, permisos, horas). Ref.: ______
- [ ] Autoridad de **liberación** (decide el paso de un anillo al siguiente). Ref.: ______

## 1. Liberación e infraestructura

- [ ] Proveedor, TLS, secretos, proxy y registro de imágenes configurados. [entrega](sdd/entrega/spec.md) T4. Ref.: ______
- [ ] CI remota ejecutada sobre el mismo commit y candidato inmutable publicado. [entrega](sdd/entrega/spec.md) T4. Ref.: ______
- [ ] Aprobación explícita de cada anillo: staging, piloto (una sede o área, 10–25 personas, al menos 20 días hábiles), expansión, Kairos y módulos por bandera, con criterio de rollback. [entrega](sdd/entrega/spec.md) T4. Ref.: ______
- [ ] Secretos de identidad, corpus de contraseñas, procedimiento de verificación de identidad y canal institucional. [identidad](sdd/identidad/spec.md) T3. Ref.: ______
- [ ] Revisión de grants y roles heredados de la base antes del piloto. [organización](sdd/organizacion/spec.md) T4. Ref.: ______

## 2. Recuperación y almacenamiento

- [ ] Proveedor de respaldos, binlogs/PITR, custodia y retención de respaldos (inicial: 30 días). [recuperación](sdd/recuperacion/spec.md) T4. Ref.: ______
- [ ] Quién autoriza una restauración y quién autoriza el desbloqueo posterior (personas distintas). [recuperación](sdd/recuperacion/spec.md) T4. Ref.: ______
- [ ] IAM de los buckets, versionado privado, custodia y rotación de la clave que sella las eliminaciones, y capacidad. [borrado](sdd/borrado-objetos/spec.md) T6. Ref.: ______
- [ ] Decisión de encender `OBJECT_CLEANUP_ENABLED` (limpieza de huérfanos y copias; apagada por defecto). [borrado](sdd/borrado-objetos/spec.md) T6. Ref.: ______
- [ ] Cuotas de disco y límites del proxy para subidas y exportaciones. [archivos](sdd/archivos/spec.md) T5. Ref.: ______

## 3. Datos: plazos y tratamientos (sin esto no se activa ninguna supresión real)

- [ ] Plazos, acción final, fundamento y retenciones legales por categoría. [retención](sdd/retencion/spec.md) T5. Ref.: ______
- [ ] Tratamiento de la categoría restante: identidad, academia, biblioteca, auditoría y logs. [retención](sdd/retencion/spec.md) T2. Ref.: ______
- [ ] Tratamiento de conservación del expediente. [expediente](sdd/expediente/spec.md) T3. Ref.: ______
- [ ] Tratamiento de las evidencias de Kairos. [Kairos](sdd/kairos/spec.md) T3. Ref.: ______
- [ ] Tratamiento y ciclo de vida de los archivos STL. [impresión 3D](sdd/impresion-3d/spec.md) T3. Ref.: ______
- [ ] Conservación y fuentes confiables de la adscripción académica; no se rellena historia con la asignación actual. [perfil académico](sdd/perfil-academico/spec.md) T3. Ref.: ______
- [ ] Fuentes autorizadas y corte para cualquier backfill de reportes; decidir si se exigen estados históricos exactos. [reportes](sdd/reportes/spec.md) T2 y T4. Ref.: ______
- [ ] Contenidos, vigencias y conservación de la biblioteca. [biblioteca](sdd/biblioteca/spec.md) T4. Ref.: ______

## 4. Reglas institucionales

- [ ] Calendario institucional real, festivos y motivos de excepción autorizados. [calendario](sdd/calendario/spec.md) T3. Ref.: ______
- [ ] Calendario, cobertura histórica y fecha de arranque del worker de ausencias; la historia anterior no se infiere. [ausencias](sdd/ausencias/spec.md) T4. Ref.: ______
- [ ] Políticas de sede y de red/ubicación, y autorización para activar el worker de asistencia. [asistencia](sdd/asistencia/spec.md) T4. Ref.: ______
- [ ] Aceptación de que la formalización del expediente no es constancia de liberación. [expediente](sdd/expediente/spec.md) T4. Ref.: ______
- [ ] Aceptación de que los periodos son registro operativo, sin metas de horas ni liberación legal. [periodos](sdd/periodos-servicio/spec.md) T3. Ref.: ______
- [ ] Reglas de gamificación y su habilitación por anillo, sin ampliar recompensas. [gamificación](sdd/gamificacion/spec.md) T3. Ref.: ______
- [ ] Operadores de impresión 3D y activación por anillo. [impresión 3D](sdd/impresion-3d/spec.md) T4. Ref.: ______

## 5. Personas, claves y comunicación

- [ ] Custodia y rotación de las claves de visitas, y personal con permisos aprobados. [visitas](sdd/visitas/spec.md) T3. Ref.: ______
- [ ] Inventario inicial confiable conciliado y grants reales revisados. [inventario](sdd/inventario/spec.md) T3. Ref.: ______
- [ ] Destinatarios y canales institucionales de cada aviso (sin inventar autoridades ni correos). [comunicaciones](sdd/comunicaciones/spec.md) T5. Ref.: ______
- [ ] Umbrales de alerta, destinatarios, canal y responsables nominales; cobertura propuesta hábil de 08 a 18 h (México) y guardia pasiva las dos primeras semanas, sin prometer 24/7. [operación](sdd/operacion/spec.md) T4. Ref.: ______
- [ ] Contenido público, contactos y avisos legales publicables. [contenido público](sdd/contenido-publico/spec.md) T4. Ref.: ______
- [ ] Identidad visual y fuente institucional, si existe una guía oficial. [interfaz](sdd/interfaz/spec.md) T6. Ref.: ______

## 6. Condicionadas

- [ ] Fuente confiable del sistema anterior y autoridad que apruebe alcance, mapeo y tratamiento; sin ella no hay migración. [migración](sdd/migracion-legado/spec.md) T1. Ref.: ______
