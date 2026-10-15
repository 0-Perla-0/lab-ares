import { expect, test } from "@playwright/test";

import { installBackend2Api } from "./fixtures/backend2-api";

test("organiza los dominios autorizados en un acordeón de apertura única", async ({
  page,
}) => {
  await installBackend2Api(page);
  await page.goto("/portal");

  const navigation = page.getByRole("navigation", {
    name: "Navegación del portal",
  });
  await expect(navigation).toBeVisible();

  const people = navigation.getByRole("button", {
    name: "Personas y trayectoria",
  });
  await people.click();
  await expect(people).toHaveAttribute("aria-expanded", "true");
  for (const label of [
    "Perfil académico",
    "Documentos",
    "Directorio",
    "Kairós",
  ]) {
    await expect(
      navigation.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }

  const knowledge = navigation.getByRole("button", {
    name: "Conocimiento y resultados",
  });
  await knowledge.click();
  await expect(knowledge).toHaveAttribute("aria-expanded", "true");
  await expect(people).toHaveAttribute("aria-expanded", "false");
  for (const label of [
    "Reportes",
    "Biblioteca",
    "Contenido público",
    "Gamificación",
  ]) {
    await expect(
      navigation.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }

  const services = navigation.getByRole("button", { name: "Servicios" });
  await services.click();
  await expect(services).toHaveAttribute("aria-expanded", "true");
  await expect(knowledge).toHaveAttribute("aria-expanded", "false");
  for (const label of ["Impresión 3D", "Retención y supresión"]) {
    await expect(
      navigation.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }
});

test("muestra la descripción tras mantener el cursor un segundo", async ({
  page,
}) => {
  await installBackend2Api(page);
  await page.goto("/portal");

  const navigation = page.getByRole("navigation", {
    name: "Navegación del portal",
  });
  const services = navigation.getByRole("button", { name: "Servicios" });
  await services.hover();
  await expect(services).toHaveCSS("border-color", "rgb(249, 115, 22)");
  await expect(services).toHaveCSS("color", "rgb(251, 146, 60)");

  const summary = navigation.getByRole("link", {
    name: "Resumen",
    exact: true,
  });
  await summary.hover();
  const tooltip = page.getByRole("tooltip", {
    name: "Consulta indicadores y el estado general de tu espacio de trabajo.",
  });
  await expect(tooltip).toBeVisible({ timeout: 1500 });
  await page.mouse.move(800, 500);
  await expect(tooltip).toBeHidden();
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
