# Pruebas de navegador

## Deterministas

Desde la raíz: `npm run test:e2e`. Next.js usa `http://localhost:4322` y las pruebas interceptan APIs.
Instalar motores con `npm exec --workspace @ares/frontend -- playwright install chromium firefox webkit`.
Se ejecutan Chromium/Firefox/WebKit; no requieren backend/DB ni prueban transacciones, SMTP o análisis real.

## Full-stack real

Desde la raíz: `npm run test:e2e:fullstack`, suite separada en [fullstack](../fullstack/).
Requiere Next/Nest/MariaDB/MinIO/ClamAV/Mailpit reales, sin interceptar API.
Usar proyecto/base `_test`/`_ci` **nuevos**, puertos libres y [overlay](../../compose.acceptance.yaml); no superponer a stack existente.

Configurar para ese stack local sintético:

```powershell
$env:ARES_FULLSTACK_URL='http://localhost:4321'
$env:ARES_MAILPIT_URL='http://localhost:8025'
$env:ARES_FULLSTACK_DB_URL='mysql://<cuenta-test>:<clave-test>@127.0.0.1:<puerto-db>/ares_acceptance_test'
npm run test:e2e:fullstack
```

- DB sólo envejece sesión de identidades `@fullstack.example.test`; se rechazan hosts/bases no seguros. No hay backdoor de reloj en API.
- **Una ejecución completa por seed**: los casos consumen ausencias, formalizaciones y factores. No reseedear/reabrir/resetear para repetir; preparar otro proyecto/base.
- Newman va después del navegador y sus colecciones se ejecutan secuencialmente. No paralelizar políticas globales mutables.
- Axe en páginas críticas no sustituye WCAG manual, todos los módulos, móviles ni cámara física. No publicar trazas/cookies aunque sean sintéticas.
- La evidencia debe corresponder al código ensayado, sin arrastrar totales previos. [Gates SDD](../../docs/sdd/entrega/spec.md).
