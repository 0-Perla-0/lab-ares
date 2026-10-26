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

test("la navegación pública enlaza páginas institucionales publicadas", async ({
  page,
}) => {
  await installBackend2Api(page);
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Servicio Social" })
    .click();
  await expect(page).toHaveURL(/\/contenido\/servicio-social$/);
  await expect(
    page.getByRole("heading", { name: "Servicio social" }),
  ).toBeVisible();
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "Contacto" }),
  ).toBeVisible();
});

test("una página sin versión publicada muestra un estado explícito", async ({
  page,
}) => {
  await installBackend2Api(page);
  await page.route("**/api/public-content/pages/contacto", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "PUBLIC_PAGE_NOT_FOUND" }),
    }),
  );
  await page.goto("/contenido/contacto");
  await expect(
    page.getByRole("heading", {
      name: "Esta información aún no está publicada",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Volver al inicio" }),
  ).toBeVisible();
});
