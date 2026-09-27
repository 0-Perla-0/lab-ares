# Pruebas E2E Backend 2

Las pruebas levantan Next.js en `http://localhost:4322` e interceptan las APIs de forma determinista. No requieren backend ni base de datos.

```bash
npm run e2e
```

La primera ejecución en una máquina nueva puede requerir `npx playwright install chromium`.
