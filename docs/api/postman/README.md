# Contratos Postman por feature

Importar [colección](ares-features.postman_collection.json) y [entorno](ares-local.postman_environment.json).
Conservar estos JSON porque tienen assertions verificadas por tests; no son un reparto de responsabilidades.

- Variables de identidad y contraseñas se completan sólo en el entorno local de prueba; el repositorio no guarda credenciales.
- Cookie jar HTTP-only y mismo host; tokens/códigos manuales obtenidos del flujo sintético/Mailpit, no de valores hardcodeados.
- No ejecutar variantes terminales incompatibles ni regenerar claves para repetir una intención incierta.
- Retención/recuperación sólo con recursos sintéticos y autorización explícita; no activar workers sobre entornos existentes.
- [Uso y colecciones](../../../postman/README.md) · [Índice SDD](../../index.md) · [Aceptación](../../sdd/entrega/spec.md).
