# Features de Ares

Revisión estática: **15/10/2026**; actualizada el **26/10/2026** (contenido público, borrado de adjuntos, outbox, scanner, recuperación), contrastada con módulos, rutas, servicios, Prisma y pruebas del árbol de trabajo.
Especificaciones SDD de features verticales; no asignaciones por persona o capa.
[Cómo trabajar](sdd/README.md) · [Memoria](../MEMORY.md).

## Inventario

**I** = recorrido implementado; aceptación integral no afirmada. **P** = implementación parcial o brecha de código comprobada.
**C** = alcance condicionado a una fuente externa. Las tareas distinguen código, validación y decisión externa.

| Feature                                               | Estado | Brecha principal / siguiente gate                                                          |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| [Identidad](sdd/identidad/spec.md)                    | I      | Calibración de abuso, corpus y aceptación de seguridad                                     |
| [Organización y usuarios](sdd/organizacion/spec.md)   | I      | Uniformar mutaciones y revisar grants                                                      |
| [Perfil académico](sdd/perfil-academico/spec.md)      | I      | Historia confiable y aceptación operativa                                                  |
| [Expediente](sdd/expediente/spec.md)                  | I      | Conservación gobernada y aceptación completa                                               |
| [Periodos de servicio](sdd/periodos-servicio/spec.md) | I      | Aceptación del registro operativo, no liberación legal                                     |
| [Asistencia y validación](sdd/asistencia/spec.md)     | I      | Carreras de workers y revisión manual/dispositivos                                         |
| [Ausencias](sdd/ausencias/spec.md)                    | I      | Cobertura histórica desconocida y aceptación real de adjuntos                              |
| [Calendario](sdd/calendario/spec.md)                  | I      | Calendario institucional aprobado                                                          |
| [Kairos](sdd/kairos/spec.md)                          | I      | Aceptación real y conservación de evidencias                                               |
| [Directorio](sdd/directorio/spec.md)                  | I      | Verificar privacidad por área/proyecto                                                     |
| [Biblioteca](sdd/biblioteca/spec.md)                  | I      | Retención y aceptación real                                                                |
| [Contenido público](sdd/contenido-publico/spec.md)    | P      | Activos del CMS (clave durable, copias) y aceptación real                                  |
| [Gamificación](sdd/gamificacion/spec.md)              | I      | Aceptación real con flags y reversos                                                       |
| [Impresión 3D](sdd/impresion-3d/spec.md)              | I      | Flujo real STL/operador y conservación                                                     |
| [Visitas](sdd/visitas/spec.md)                        | I      | Cámara física y custodia de claves                                                         |
| [Inventario](sdd/inventario/spec.md)                  | I      | Aceptación multirréplica y conciliación operativa                                          |
| [Reportes](sdd/reportes/spec.md)                      | P      | Historia punto-en-el-tiempo y carga                                                        |
| [Archivos](sdd/archivos/spec.md)                      | P      | Cuotas distribuidas y limpieza de copias                                                   |
| [Borrado de objetos](sdd/borrado-objetos/spec.md)     | P      | Copias y huérfanos (adjuntos de ausencia ya cubiertos)                                     |
| [Retención](sdd/retencion/spec.md)                    | P      | Adaptadores y lifecycle de todas las categorías                                            |
| [Comunicaciones](sdd/comunicaciones/spec.md)          | P      | Productores restantes y matriz institucional de avisos                                     |
| [Escrituras seguras](sdd/escrituras-seguras/spec.md)  | P      | Mutaciones restantes (organización, usuarios, gamificación admin, asistencia, activos CMS) |
| [Operación y auditoría](sdd/operacion/spec.md)        | P      | Época en asistencia/ausencias/inventario/manifiestos y aceptación multirréplica            |
| [Recuperación](sdd/recuperacion/spec.md)              | P      | Importar intenciones huérfanas (ya se diagnostican) y restore DB+objetos+journal           |
| [Entrega y aceptación](sdd/entrega/spec.md)           | P      | WCAG manual, carga, CI remota y promoción autorizada                                       |
| [Sistema visual](sdd/interfaz/spec.md)                | P      | Revisión manual de accesibilidad en claro/oscuro e identidad aprobada                      |
| [Migración del legado](sdd/migracion-legado/spec.md)  | C      | Sólo si aparece una fuente confiable                                                       |
| [Documentación SDD](sdd/documentacion/spec.md)        | I      | Gate incorporado a quality y validación local aprobada                                     |

## Orden recomendado

1. Borrado de objetos y retención: resolver bloqueos explícitos sin reintroducir DELETE bajo rollback SQL.
2. Archivos/comunicaciones/escrituras/operación: cerrar la matriz de época, lease, reintento, autorización y flags por efecto.
3. Reportes: definir historia faltante antes de implementar backfills; medir capacidad de archivos/exportaciones.
4. Recuperación: ensayo coordinado aislado y reconciliación de intenciones externas antes de reapertura.
5. Entrega: aceptación por feature, accesibilidad humana, carga y CI; después aprobación externa de piloto/promoción.

No reimplementar recorridos existentes. Tratamientos, destinatarios, calendario, secretos, proveedor y liberación requieren autoridad externa; no inventarlos.
No hay porcentaje global de terminado: código, evidencia local y autorización institucional son estados diferentes.
