import { expect, test, type Page } from "@playwright/test";

import { installBackend2Api } from "./fixtures/backend2-api";

async function openSedeModal(page: Page) {
  await installBackend2Api(page);
  await page.route("**/api/organization/sedes", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    });
  });
  await page.goto("/portal/sedes");
  await page.getByRole("button", { name: "Nueva sede" }).click();
  return page.getByRole("dialog", { name: "Registrar sede" });
}

test("el modal cubre el layout y permanece completo en escritorio", async ({
  page,
}) => {
  const dialog = await openSedeModal(page);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Registrar sede" }),
  ).toBeVisible();

  expect(
    await dialog.evaluate(
      (element) => element.parentElement?.parentElement === document.body,
    ),
  ).toBe(true);
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
});

test("el modal conserva encabezado y acciones dentro del viewport móvil", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 720 });
  const dialog = await openSedeModal(page);

  await expect(
    dialog.getByRole("heading", { name: "Registrar sede" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Crear sede" }),
  ).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(720);
});
