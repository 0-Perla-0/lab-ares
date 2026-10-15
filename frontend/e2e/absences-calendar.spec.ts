import { expect, test, type Page } from "@playwright/test";
import { installBackend2Api } from "./fixtures/backend2-api";
const absenceId = "c123456789012345678901234";
const row = {
  id: absenceId,
  userId: 5,
  user: { codigo: "SS005" },
  fecha: "2026-10-08T00:00:00Z",
  estado: "PENDIENTE_JUSTIFICACION",
  version: 1,
  plazoLimiteAt: "2099-10-20T05:59:59Z",
  aclaracionLimiteAt: null,
  apelacionLimiteAt: null,
  motivoResolucion: null,
  resueltoPorId: null,
  justificaciones: [],
  apelacion: null,
  businessDaysRemaining: 5,
};
async function setup(page: Page, admin = false) {
  await installBackend2Api(page);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        data: {
          id: 5,
          codigo: "SS005",
          email: "synthetic@ares.test",
          rol: admin ? "ADMIN" : "PRESTADOR",
          estado: "ACTIVA",
          sedeId: 1,
          areaId: 2,
          turnoId: 3,
          permissions: {
            "absences:self": "self",
            "calendar:read": "self",
            ...(admin ? { "calendar:manage": "global" } : {}),
          },
        },
      },
    }),
  );
  await page.route("**/api/absences/me?**", (route) =>
    route.fulfill({
      json: {
        data: {
          items: [row],
          nextCursor: null,
          timeZone: "America/Mexico_City",
          serverTime: "2026-10-10T18:00:00Z",
        },
      },
    }),
  );
}
test("soporte privado espera análisis y sólo confirma una justificación tras respuesta", async ({
  page,
}) => {
  await setup(page);
  const archivoId = "a".repeat(30);
  await page.route("**/api/files", (route) =>
    route.fulfill({
      status: 201,
      json: { data: { id: archivoId, status: "PENDIENTE_ANALISIS" } },
    }),
  );
  await page.route(`**/api/files/${archivoId}`, (route) =>
    route.fulfill({ json: { data: { id: archivoId, status: "DISPONIBLE" } } }),
  );
  let submitted = false;
  await page.route(`**/api/absences/${absenceId}/justify`, async (route) => {
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    expect(route.request().postDataJSON()).toEqual({
      version: 1,
      motivo: "Justificación sintética",
      archivoId,
    });
    submitted = true;
    await route.fulfill({
      status: 201,
      json: { data: { ...row, estado: "JUSTIFICACION_ENVIADA" } },
    });
  });
  await page.goto("/portal/asistencia/ausencias");
  await page.getByRole("button", { name: "Justificar / aclarar" }).click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Motivo", { exact: false })
    .fill("Justificación sintética");
  await modal.getByLabel("Soporte opcional").setInputFiles({
    name: "soporte.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF"),
  });
  await expect(modal.getByRole("status")).toContainText("PENDIENTE_ANALISIS");
  expect(submitted).toBe(false);
  await modal.getByRole("button", { name: "Revisar análisis" }).click();
  await modal.getByRole("button", { name: "Enviar al servidor" }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("Operación confirmada");
  expect(submitted).toBe(true);
  await expect(
    page.getByRole("button", { name: "Bandeja de revisión" }),
  ).toHaveCount(0);
});
test("pérdida de respuesta conserva clave y anuncia resultado desconocido", async ({
  page,
}) => {
  await setup(page);
  const keys: string[] = [];
  await page.route(`**/api/absences/${absenceId}/justify`, async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) await route.abort("failed");
    else
      await route.fulfill({
        status: 201,
        json: { data: { ...row, estado: "JUSTIFICACION_ENVIADA" } },
      });
  });
  await page.goto("/portal/asistencia/ausencias");
  await page.getByRole("button", { name: "Justificar / aclarar" }).click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Motivo", { exact: false })
    .fill("Escrito privado sintético");
  await modal.getByRole("button", { name: "Enviar al servidor" }).click();
  await expect(modal.getByRole("alert")).toContainText("RESULTADO_DESCONOCIDO");
  const storage = await page.evaluate(() =>
    JSON.stringify(Object.values(sessionStorage)),
  );
  expect(storage).not.toContain("Escrito privado sintético");
  await modal.getByRole("button", { name: "Enviar al servidor" }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("Operación confirmada");
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});
test("calendario permite vista previa retroactiva antes de confirmar a 320px", async ({
  page,
}) => {
  await setup(page, true);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.route("**/api/calendar/events?**", (route) =>
    route.fulfill({
      json: {
        data: {
          items: [],
          shift: {
            start: "08:00:00",
            end: "12:00:00",
            days: ["LUNES", "MARTES"],
          },
        },
      },
    }),
  );
  let previewed = false;
  await page.route("**/api/calendar/exceptions/preview", async (route) => {
    previewed = true;
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    await route.fulfill({
      status: 201,
      json: {
        data: {
          previewId: absenceId,
          expiresAt: "2099-10-10T20:00:00Z",
          users: 2,
          attendances: 1,
          absences: 1,
          definitive: 0,
        },
      },
    });
  });
  await page.route("**/api/calendar/exceptions", async (route) => {
    expect(previewed).toBe(true);
    expect(route.request().postDataJSON().previewId).toBe(absenceId);
    await route.fulfill({ status: 201, json: { data: { id: "exception" } } });
  });
  await page.goto("/portal/calendario");
  await page.getByRole("button", { name: "Nueva excepción" }).click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Título", { exact: true })
    .fill("Suspensión sintética");
  await modal
    .getByLabel("Motivo auditado")
    .fill("Cierre institucional sintético");
  await modal.getByLabel("Inicio", { exact: true }).fill("2020-10-01");
  await modal.getByLabel("Fin", { exact: true }).fill("2020-10-01");
  await modal.getByRole("button", { name: "Calcular vista previa" }).click();
  await expect(modal.getByRole("status")).toContainText("2 usuarios");
  await modal.getByRole("button", { name: "Crear excepción" }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("Excepción confirmada");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Semanal", exact: true }).click();
  await expect(page.getByLabel("Día de la semana a consultar")).toBeVisible();
});
