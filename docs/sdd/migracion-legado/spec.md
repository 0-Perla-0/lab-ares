# Migración selectiva del legado

ID: `migracion-legado` · Estado: condicionada · Revisión: 2026-10-15

## Objetivo y alcance

Importar sólo fuentes necesarias y confiables cuando aparezcan DB/CSV/archivos/saldos confirmados. Decisión 16B.
No es requisito de implementación nueva sin fuente disponible; no se encontró importador general certificado en el código revisado.

## Reglas y criterios de aceptación

- **AC-1:** Inventario/mapeo/dry-run/aprobación/importación/conciliación por lote, idempotente con procedencia e identificadores conservados.
- **AC-2:** Nunca importar contraseñas, hashes, sesiones, tokens ni invitaciones antiguas. Usuarios deduplicados activan por invitación nueva y rol/alcance mapeados explícitamente.
- **AC-3:** Horas detalladas consistentes quedan de sólo lectura; total confirmado sólo como saldo inicial auditable. Nunca inventar check-in/out.
- **AC-4:** Documento atribuible sin prueba de autorización va a revisión/histórico sin validación; ambigüedad se aísla sin efectos oficiales. No migrar demostraciones/datos secundarios por defecto.

## Diseño y evidencia

- Código de destino: [Prisma](../../../backend/prisma/), [organización](../../../backend/src/organization/), [invitaciones](../../../backend/src/invitations/).
- Los seeds de aceptación son fixtures sintéticos, no importadores de legado ni fuente de saldos reales.
- Diseño del importador y pruebas de conciliación quedan condicionados a inventario/fuente/aprobación; no declarar un pipeline inexistente como implementado.

## Tareas y pendientes

- [ ] **T1 · externo · AC-1/2/3/4:** Identificar fuente confiable y autoridad que apruebe alcance/mapeo/tratamiento.
- [ ] **T2 · externo · AC-1/2/3/4:** Depende de T1: sólo si aparece una fuente confiable se diseña el importador por lote con preview, deduplicación y auditoría.
- [ ] **T3 · validación · AC-1/3/4:** Ensayo aislado repetible y conciliación de cantidades, permisos y archivos; aprobación previa a datos reales.
