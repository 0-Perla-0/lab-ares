# Memoria de continuidad

Corte: **26 de octubre de 2026**. Mantener breve; el backlog vive en cada [feature SDD](docs/index.md).

## Decisiones estables

- SDD organiza funcionalidades completas, sin reparto numerado por capas. [Flujo](docs/sdd/README.md).
- Next.js consume `/api` de NestJS; MariaDB conserva dominio/sesiones y S3 privado conserva binarios.
- Zod es la validación existente; no introducir otra infraestructura por ejemplos históricos.
- Academia no concede RBAC. Formalización y periodos son registro operativo, no liberación legal ni abono de horas.
- Historia anterior al corte de snapshots permanece desconocida; no reconstruir obligaciones con asignaciones actuales.
- MFA es opcional para todos los roles. Ubicación/red son consultivas, no bloquean asistencia.

## Advertencias al retomar

- El árbol acumulado se guardó/publicó en `feature/docs/sdd-features` (`073e536`); las ramas históricas de fases compartían el mismo punto, no snapshots separados. La integración posterior en `develop` queda sólo local por instrucción expresa, sin push de esa rama.
- Los módulos operativos ya existen: no volver a implementar ausencias/calendario/visitas/inventario/consolas a partir de planes antiguos.
- El borrado durable sólo cubre ciertos recursos; adjuntos de ausencias usan ya el protocolo (26/10, sólo con mocks); limpiezas de copias/huérfanos siguen bloqueadas. [Contrato y tareas](docs/sdd/borrado-objetos/spec.md).
- Retención no tiene tratamientos institucionales universales; una enum o adaptador listado no autoriza supresión.
- No borrar bases, volúmenes, buckets, evidencia ni decisiones para repetir pruebas. Un seed full-stack admite una ejecución completa; Newman va después del navegador.
- Ninguna prueba local autoriza producción, PITR, unfreeze, activación de workers o políticas institucionales.

## Evidencia y límites

- Evidencia heredada del 13/10, **no reproducida por la migración documental**: 35 migraciones e integración 100 aprobadas y 3 opt-in omitidas. El 26/10 se reprodujo en un stack aislado: integración 103/3 omitidas y opt-in de SMTP, retención y MinIO aprobados ([entrega](docs/sdd/entrega/spec.md)).
- Los 18 casos dirigidos de borrado incluyen 17 ya contados en integración; no sumar dos veces.
- El navegador/SMTP/restore de cortes previos no certifican el último cambio de borrado. CI remota y liberación no constan ejecutadas.
- Artefactos locales previos: `C:\Users\jaret\AppData\Local\Temp\opencode\ares-deletion-upgrade-20261013`; no son evidencia portable de CI.
- Los documentos monolíticos y checkpoints duplicados fueron sustituidos por SDD; no mantener una copia archivada extensa dentro del proyecto.
- Gates de la migración documental del 15/10: ver [evidencia de la feature](docs/sdd/documentacion/spec.md). Quality requiere `DATABASE_URL` incluso sin conectar; una URL sintética de proceso no acredita integración real.
- Gates y límites de la integración local posterior: [entrega](docs/sdd/entrega/spec.md). Conservar MFA, ambas rutas de recuperación y modales con portal/scroll/tamaños; no recuperar el documento monolítico durante futuros merges.
