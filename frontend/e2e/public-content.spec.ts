import { expect, test } from "@playwright/test";

import { installBackend2Api } from "./fixtures/backend2-api";

test("contenido público trata el texto editorial como texto, no como HTML ejecutable", async ({
  page,
}) => {
  await installBackend2Api(page);
  await page.goto("/contenido/servicio-social");
  await expect(
    page.getByRole("heading", { name: "Servicio social" }),
  ).toBeVisible();
  await expect(page.getByText(/<img id="injected"/)).toBeVisible();
  await expect(page.locator("#injected")).toHaveCount(0);
});

test("CMS administrativo lista y abre la página publicada", async ({
  page,
}) => {
  await installBackend2Api(page);
  await page.goto("/portal/contenido");
  await expect(
    page.getByRole("heading", { name: "Gestión de contenido" }),
  ).toBeVisible();
  await page.getByText("/servicio-social").click();
  await expect(
    page.getByRole("dialog", { name: "/servicio-social" }),
  ).toBeVisible();
});
