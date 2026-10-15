import { expect, test } from "@playwright/test";
import { installBackend2Api } from "./fixtures/backend2-api";

test("no entra al portal hasta completar el desafío MFA", async ({ page }) => {
  await installBackend2Api(page);
  let verified = false;
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      json: {
        data: {
          mfaRequired: true,
          challenge: "private-challenge",
          expiresIn: 300,
        },
      },
    }),
  );
  await page.route("**/api/auth/mfa/verify", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      challenge: "private-challenge",
      code: "123456",
    });
    verified = true;
    await route.fulfill({ json: { data: { authenticated: true } } });
  });
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("self@ares.test");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Una frase segura de contraseña");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByLabel("Código de tu aplicación autenticadora"),
  ).toBeVisible();
  expect(page.url()).toContain("/login");
  expect(verified).toBe(false);
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveCount(0);
  await page.getByLabel("Código de tu aplicación autenticadora").fill("123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await expect(page).toHaveURL(/\/portal$/);
  expect(verified).toBe(true);
});

test("recuperación confirma genéricamente y no muestra tokens en el mensaje", async ({
  page,
}) => {
  await page.route("**/api/auth/recovery/request", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ email: "self@ares.test" });
    await route.fulfill({ json: { data: { accepted: true } } });
  });
  await page.goto("/recuperar");
  await page.getByLabel("Correo electrónico").fill("self@ares.test");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Si la cuenta permite recuperación",
  );
});

test("acepta una invitación pública con contraseña elegida por el invitado", async ({
  page,
}) => {
  await page.route("**/api/invitations/private-token/accept", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      codigo: "INV001",
      password: "Mi frase larga de contraseña",
    });
    await route.fulfill({ status: 201, json: { data: { id: 7 } } });
  });
  await page.goto("/invitacion?token=private-token");
  await page.getByLabel("Código institucional").fill("INV001");
  await page
    .getByLabel("Nueva contraseña")
    .fill("Mi frase larga de contraseña");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("status")).toContainText("Operación completada");
});

test("configura TOTP y muestra códigos sólo hasta ocultarlos", async ({
  page,
}) => {
  await installBackend2Api(page);
  let enabled = false;
  await page.route("**/api/auth/sessions", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "own-session",
            current: true,
            createdAt: "2026-10-10T12:00:00Z",
            lastActivityAt: "2026-10-10T13:00:00Z",
          },
        ],
      },
    }),
  );
  await page.route("**/api/auth/mfa", (route) =>
    route.fulfill({ json: { data: { enabled } } }),
  );
  await page.route("**/api/auth/mfa/setup", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      password: "Mi frase larga de contraseña",
    });
    await route.fulfill({
      json: {
        data: {
          secret: "GEZDGNBVGY3TQOJQ",
          otpauthUri:
            "otpauth://totp/ARES:self?secret=GEZDGNBVGY3TQOJQ&issuer=ARES",
        },
      },
    });
  });
  await page.route("**/api/auth/mfa/enable", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ code: "123456" });
    enabled = true;
    await route.fulfill({
      json: { data: { recoveryCodes: ["private-recovery-code"] } },
    });
  });
  await page.goto("/portal/seguridad");
  const setup = page
    .getByRole("button", { name: "Preparar TOTP" })
    .locator("..");
  await setup
    .getByLabel("Confirma tu contraseña")
    .fill("Mi frase larga de contraseña");
  await setup.getByRole("button", { name: "Preparar TOTP" }).click();
  await expect(
    page.getByText("GEZDGNBVGY3TQOJQ", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Código TOTP").fill("123456");
  await page.getByRole("button", { name: "Confirmar activación" }).click();
  await expect(
    page.getByText("private-recovery-code", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ya los guardé; ocultar" }).click();
  await expect(
    page.getByText("private-recovery-code", { exact: true }),
  ).toHaveCount(0);
});

test("validación verde envía versiones y una clave idempotente", async ({
  page,
}) => {
  await installBackend2Api(page);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        data: {
          id: 9,
          codigo: "JEFE9",
          email: "jefe@ares.test",
          rol: "JEFE_AREA",
          estado: "ACTIVA",
          sedeId: 1,
          areaId: 2,
          turnoId: 3,
          permissions: {
            "attendance:manage": "area",
            "hours:validate": "area",
          },
        },
      },
    }),
  );
  let approved = false;
  await page.route("**/api/attendance/review?**", (route) =>
    route.fulfill({
      json: {
        data: {
          nextCursor: null,
          items: approved
            ? []
            : [
                {
                  id: 1,
                  userId: 5,
                  user: { codigo: "USER5" },
                  version: 2,
                  status: "PENDIENTE",
                  checkInAt: "2026-10-05T15:00:00Z",
                  checkOutAt: "2026-10-05T17:00:00Z",
                  durationSeconds: 7200,
                  requiresReview: false,
                  risk: { color: "VERDE", reasons: [], policyVersion: 1 },
                },
              ],
        },
      },
    }),
  );
  await page.route("**/api/attendance/validate-batch", async (route) => {
    expect(route.request().headers()["idempotency-key"]).toMatch(
      /^[A-Za-z0-9_-]{16,100}$/,
    );
    expect(route.request().postDataJSON()).toEqual({
      items: [{ id: 1, version: 2 }],
      reason: "Revisión completa",
    });
    approved = true;
    await route.fulfill({ status: 201, json: { data: { items: [] } } });
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/portal/validaciones");
  await page.getByLabel("Seleccionar #1 para aprobación verde").check();
  const form = page
    .getByRole("button", { name: "Autorizar seleccionadas (1)" })
    .locator("..");
  await form.getByLabel("Motivo obligatorio").fill("Revisión completa");
  await form
    .getByRole("button", { name: "Autorizar seleccionadas (1)" })
    .click();
  await expect(page.getByRole("status")).toContainText("Operación confirmada");
  await expect(
    page.getByText("No hay registros en esta página."),
  ).toBeVisible();
});
