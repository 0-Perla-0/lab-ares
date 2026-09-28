import { expect, test } from "@playwright/test";

test("recupera la contraseña desde el inicio de sesión", async ({ page }) => {
  const requests: Array<{ path: string; body: unknown }> = [];

  await page.route("**/api/auth/recovery/request", async (route) => {
    requests.push({
      path: new URL(route.request().url()).pathname,
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: { accepted: true } }),
    });
  });
  await page.route("**/api/auth/recovery/reset", async (route) => {
    requests.push({
      path: new URL(route.request().url()).pathname,
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: { reset: true } }),
    });
  });

  await page.goto("/login");
  await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
  await page.waitForURL("**/recuperar-contrasena");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Correo electrónico").fill("admin@ares.local");
  await page.getByRole("button", { name: "Enviar token" }).click();
  await expect(page.getByText(/Revisa el correo enviado/)).toBeVisible();

  await page
    .getByLabel("Token de recuperación")
    .fill("token-temporal-de-prueba-1234567890");
  await page
    .getByLabel("Nueva contraseña", { exact: true })
    .fill("NuevaContraseña2026!");
  await page.getByLabel("Confirmar contraseña").fill("NuevaContraseña2026!");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();

  await expect(page.getByText("Contraseña actualizada")).toBeVisible();
  expect(requests).toEqual([
    { path: "/api/auth/recovery/request", body: { email: "admin@ares.local" } },
    {
      path: "/api/auth/recovery/reset",
      body: {
        token: "token-temporal-de-prueba-1234567890",
        password: "NuevaContraseña2026!",
      },
    },
  ]);
});
