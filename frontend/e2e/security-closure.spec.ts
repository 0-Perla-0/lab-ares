import { expect, test, type Page } from "@playwright/test";

async function securityApi(page: Page, nearExpiration = false) {
  const state = { revocations: 0, confirmations: 0, sessionReads: 0 };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === "/api/auth/me")
      data = {
        id: 1,
        codigo: "TEST-ADMIN",
        email: "test@example.test",
        rol: "ADMIN",
        estado: "ACTIVA",
        sedeId: 1,
        areaId: 1,
        turnoId: 1,
        permissions: { "users:read": "global" },
      };
    if (path === "/api/auth/mfa") data = { enabled: false };
    if (path === "/api/auth/sessions")
      data = [
        {
          id: "current",
          current: true,
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
        },
        {
          id: "other",
          current: false,
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
        },
      ];
    if (path === "/api/auth/session-status") {
      state.sessionReads++;
      const now = Date.now();
      data = {
        serverAt: new Date(now).toISOString(),
        absoluteExpiresAt: new Date(
          now + (nearExpiration ? 90000 : 8 * 60 * 60_000),
        ).toISOString(),
        idleExpiresAt: new Date(
          now + (nearExpiration ? 90000 : 30 * 60_000),
        ).toISOString(),
      };
    }
    if (path === "/api/recovery/status") data = { active: false };
    if (path === "/api/auth/sessions/others") {
      state.revocations++;
      if (state.confirmations < 2)
        return route.fulfill({
          status: 403,
          json: { error: "REAUTH_REQUIRED", details: { factor: "password" } },
        });
      data = { count: 1 };
    }
    if (path === "/api/auth/reauthenticate") {
      state.confirmations++;
      if (state.confirmations === 1)
        return route.fulfill({
          status: 401,
          json: { error: "INVALID_CREDENTIALS" },
        });
      data = { authenticated: true, expiresIn: 900 };
    }
    await route.fulfill({ json: { data } });
  });
  return state;
}

test("recent authentication retains focus, keeps a wrong-password session and never automatically replays", async ({
  page,
}) => {
  const state = await securityApi(page);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/portal/seguridad");
  const revoke = page.getByRole("button", {
    name: "Cerrar las demás sesiones",
  });
  await revoke.click();
  const dialog = page.getByRole("dialog", { name: "Confirma tu identidad" });
  await expect(dialog).toBeVisible();
  const password = dialog.getByLabel("Contraseña actual");
  await expect(
    dialog.getByRole("button", { name: "Cerrar", exact: true }),
  ).toBeFocused();
  await password.fill("Wrong-password-2026");
  await dialog.getByRole("button", { name: "Confirmar identidad" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/portal\/seguridad$/);
  expect(state.revocations).toBe(1);
  await password.fill("Valid-password-2026");
  await dialog.getByRole("button", { name: "Confirmar identidad" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "no se reenvió automáticamente" }),
  ).toBeVisible();
  expect(state.revocations).toBe(1);
  await revoke.click();
  await expect.poll(() => state.revocations).toBe(2);
});

test("session warning uses server deadlines and passive timers do not make keepalive requests", async ({
  page,
}) => {
  const state = await securityApi(page, true);
  await page.clock.install();
  await page.goto("/portal/seguridad");
  await expect(
    page.getByRole("region", { name: "Caducidad de sesión" }),
  ).toBeVisible();
  const initialReads = state.sessionReads;
  expect(initialReads).toBeGreaterThanOrEqual(1);
  expect(initialReads).toBeLessThanOrEqual(2); // React development StrictMode remount.
  await page.clock.fastForward(10000);
  expect(state.sessionReads).toBe(initialReads);
  await page
    .getByRole("button", { name: "Verificar y mantener actividad" })
    .click();
  await expect.poll(() => state.sessionReads).toBeGreaterThan(initialReads);
});
