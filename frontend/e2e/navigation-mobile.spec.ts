import { expect, test } from "@playwright/test";

import { installBackend2Api } from "./fixtures/backend2-api";

const domains = [
  "Perfil académico",
  "Documentos",
  "Directorio",
  "Kairós",
  "Reportes",
  "Biblioteca",
  "Contenido público",
  "Gamificación",
  "Impresión 3D",
  "Retención y supresión",
];

test("muestra los diez dominios Backend 2 en la navegación autorizada", async ({
  page,
}) => {
  await installBackend2Api(page);
  await page.goto("/portal");

  const navigation = page.getByRole("navigation", {
    name: "Navegación del portal",
  });
  await expect(navigation).toBeVisible();
  for (const label of domains) {
    await expect(
      navigation.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }
});

test("shell móvil conserva foco y no produce desbordamiento horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installBackend2Api(page);
  await page.goto("/portal");

  const trigger = page.getByRole("button", { name: "Abrir menú" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Menú del portal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cerrar menú" }).last(),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
