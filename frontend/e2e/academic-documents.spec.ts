import { expect, test } from "@playwright/test";

import { installBackend2Api } from "./fixtures/backend2-api";

test("perfil académico carga catálogos, historial y envía una solicitud", async ({
  page,
}) => {
  const state = await installBackend2Api(page);
  await page.goto("/portal/perfil-academico");

  await expect(
    page.getByRole("heading", { name: "Perfil académico" }),
  ).toBeVisible();
  await expect(page.getByText("Universidad ARES").first()).toBeVisible();
  await page.getByRole("button", { name: /Enviar solicitud/i }).click();
  await expect
    .poll(() =>
      state.requests.some(
        (item) =>
          item.method === "PUT" && item.path === "/api/academic/profile/me",
      ),
    )
    .toBe(true);
});

test("expediente espera el scan antes de asociar la nueva versión", async ({
  page,
}) => {
  const state = await installBackend2Api(page);
  await page.goto("/portal/expediente");

  await expect(
    page.getByRole("heading", { name: "Expediente documental" }),
  ).toBeVisible();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "identificacion.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("archivo-e2e-seguro"),
    });
  await expect(
    page.getByRole("status").filter({ hasText: /quedó en revisión/i }),
  ).toBeVisible({ timeout: 10_000 });
  expect(state.filePolls).toBeGreaterThan(0);
  expect(
    state.requests.some(
      (item) =>
        item.method === "POST" && item.path === "/api/documents/versions",
    ),
  ).toBe(true);
});
