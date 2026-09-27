import { expect, test } from "@playwright/test";

import { installBackend2Api } from "./fixtures/backend2-api";

test("gamificación distingue módulo deshabilitado y consola administrativa", async ({
  page,
}) => {
  await installBackend2Api(page, { gamificationDisabled: true });
  await page.goto("/portal/gamificacion");
  await expect(
    page.getByRole("heading", { name: "Gamificación no disponible" }),
  ).toBeVisible();

  await page.unroute("**/api/**");
  await installBackend2Api(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Mi progreso" }),
  ).toBeVisible();
  await expect(page.getByText("Administración", { exact: true })).toBeVisible();
});

test("biblioteca presenta documentos versionados", async ({ page }) => {
  await installBackend2Api(page);
  await page.goto("/portal/biblioteca");
  await expect(
    page.getByRole("heading", { name: "Biblioteca versionada" }),
  ).toBeVisible();
  await page.getByText("Manual institucional").click();
  await expect(page.getByText("Versión inicial")).toBeVisible();
});

test("impresión 3D cubre estado apagado y solicitud habilitada", async ({
  page,
}) => {
  await installBackend2Api(page, { printingDisabled: true });
  await page.goto("/portal/impresion-3d");
  await expect(
    page.getByRole("heading", { name: "Impresión 3D no disponible" }),
  ).toBeVisible();

  await page.unroute("**/api/**");
  const state = await installBackend2Api(page);
  await page.reload();
  await page.getByRole("button", { name: "Nueva solicitud" }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva solicitud 3D" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "pieza.stl",
    mimeType: "model/stl",
    buffer: Buffer.from("solid pieza\nendsolid pieza"),
  });
  await dialog.getByLabel("Descripción").fill("Pieza de validación E2E");
  await dialog.getByRole("button", { name: "Crear solicitud" }).click();
  await expect
    .poll(() =>
      state.requests.some(
        (item) =>
          item.method === "POST" && item.path === "/api/printing-3d/jobs",
      ),
    )
    .toBe(true);
});

test("retención crea solicitud y exige confirmación para reaplicar el ledger", async ({
  page,
}) => {
  const state = await installBackend2Api(page);
  await page.goto("/portal/retencion");
  await expect(
    page.getByRole("heading", { name: "Retención y supresión" }),
  ).toBeVisible();

  await page
    .getByLabel(/Motivo/i)
    .fill("Solicitud de supresión creada durante la validación E2E");
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect
    .poll(() =>
      state.requests.some(
        (item) =>
          item.method === "POST" && item.path === "/api/retention/requests/me",
      ),
    )
    .toBe(true);

  page.once("dialog", (browserDialog) => browserDialog.accept());
  await page
    .getByRole("button", { name: "Reaplicar tras restauración" })
    .click();
  await expect
    .poll(() =>
      state.requests.some(
        (item) =>
          item.method === "POST" &&
          item.path === "/api/retention/suppression-registry/reapply",
      ),
    )
    .toBe(true);
});
