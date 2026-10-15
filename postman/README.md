# Colecciones de prueba por funcionalidad

Usar sólo cuentas/bases sintéticas aisladas. Contrato vigente: `GET /api/docs/openapi.json`.
Las colecciones JSON son artefactos ejecutables, no la fuente del estado funcional: consultar [SDD](../docs/index.md).

| Colección                                                                                      | Uso                                                          |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [Administración y dominios](Ares-Backend.postman_collection.json)                              | Auth, organización, usuarios, documentos, Kairos y servicios |
| [Asistencia](Ares-Asistencia.postman_collection.json)                                          | Entrada/salida/cierre; claves distintas por intención        |
| [Operación](Ares-Fases-Operativas.postman_collection.json)                                     | Visitas, inventario y consolas                               |
| [Aceptación integral](Ares-Aceptacion-Integral.postman_collection.json)                        | Stack real sintético recién sembrado                         |
| [Periodos y garantías](Ares-Cierre-Restante.postman_collection.json)                           | Extensión de aceptación con sujeto independiente             |
| [Contratos adicionales por feature](../docs/api/postman/ares-features.postman_collection.json) | Identidad, academia y servicios; variables manuales          |

## Uso seguro

- Importar [entorno local](Ares-Local.postman_environment.json), configurar `baseUrl` y credenciales de pruebas fuera del repositorio.
- Mismo host para todas las peticiones: cookie HTTP-only mediante cookie jar, sin `Authorization` ni copiar sesiones a cuerpos.
- `http://localhost:3000/api` directo o `http://localhost:4321/api` a través de Next.js.
- Conservar la misma `Idempotency-Key` y payload al reintentar; usar otra clave sólo para una intención nueva confirmada como tal.
- Tokens de invitación/recuperación y códigos MFA se obtienen manualmente del flujo sintético; nunca versionarlos.
- Archivos privados deben llegar a `DISPONIBLE` tras escaneo; los flags no se activan sobre entornos existentes para probar.
- Las colecciones generales requieren elegir escenarios y roles; no ejecutar todas indiscriminadamente ni inferir vigencia de ejemplos antiguos sobre OpenAPI.
- Aceptación: un proyecto/base nuevos por seed; navegador primero, después aceptación integral y después periodos/garantías, sin paralelismo ni repetir decisiones consumidas.
- Retención/recuperación pueden eliminar datos o congelar escrituras: sólo recursos sintéticos explícitos, preview/autoridad vigentes y protocolo actual. Nunca bases productivas.
- Ver [entrega](../docs/sdd/entrega/spec.md), [borrado](../docs/sdd/borrado-objetos/spec.md) y [recuperación](../docs/sdd/recuperacion/spec.md) antes de ensayos con efectos.
