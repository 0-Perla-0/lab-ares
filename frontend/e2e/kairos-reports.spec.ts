import { expect, test } from "@playwright/test";

import { installBackend2Api } from "./fixtures/backend2-api";

test("Kairós renderiza el Kanban y registra una actividad", async ({
  page,
}) => {
  const state = await installBackend2Api(page);
  await page.goto("/portal/kairos/project-1");

  await expect(
    page.getByRole("heading", { name: "Portal ARES" }),
  ).toBeVisible();
  await expect(page.getByText("Validar E2E")).toBeVisible();
  await page.getByRole("button", { name: "Nueva actividad" }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva actividad" });
  await dialog.getByLabel("Título").fill("Actividad creada por E2E");
  await dialog
    .getByRole("button", { name: /Crear actividad|Guardar/i })
    .click();
  await expect
    .poll(() =>
      state.requests.some(
        (item) =>
          item.method === "POST" &&
          item.path === "/api/kairos/projects/project-1/activities",
      ),
    )
    .toBe(true);
});

test("reportes descarga CSV síncrono", async ({ page }) => {
  await installBackend2Api(page, { reportExport: "sync" });
  await page.goto("/portal/reportes");
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Generar CSV" }).click();
  expect((await download).suggestedFilename()).toBe("ares.csv");
});

test("reportes consulta el trabajo asíncrono hasta completarlo", async ({
  page,
}) => {
  const state = await installBackend2Api(page, { reportExport: "async" });
  await page.goto("/portal/reportes");
  await page.getByRole("button", { name: "Generar CSV" }).click();
  await expect(page.getByText("COMPLETADO")).toBeVisible({ timeout: 8_000 });
  expect(state.reportPolls).toBeGreaterThan(0);
  const downloadButton = page.getByRole("button", { name: /Descargar/i });
  await expect(downloadButton).toBeVisible();
  page.once("popup", (popup) => void popup.close());
  await downloadButton.click();
  await expect
    .poll(() =>
      state.requests.some(
        (item) => item.path === "/api/reports/export/export-1/download",
      ),
    )
    .toBe(true);
});
