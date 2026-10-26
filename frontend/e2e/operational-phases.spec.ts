import { expect, test, type Page } from "@playwright/test";
import { installBackend2Api } from "./fixtures/backend2-api";
test("geolocalización denegada no bloquea la entrada ni persiste coordenadas", async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, error: (value: object) => void) =>
          error({ code: 1 }),
      },
    }),
  );
  let recorded = false;
  const open = {
    id: 9,
    userId: 5,
    user: { codigo: "SYNTHETIC-ADMIN" },
    checkInAt: "2026-10-11T18:00:00Z",
    checkOutAt: null,
    status: "ABIERTA",
    durationSeconds: null,
    abnormal: false,
    version: 1,
    requiresReview: false,
    risk: {
      color: "AMARILLO",
      reasons: ["UBICACION_NO_VERIFICADA"],
      policyVersion: 1,
    },
  };
  await page.route("**/api/attendance/me?**", (route) =>
    route.fulfill({
      json: {
        data: {
          items: recorded ? [open] : [],
          open: recorded ? open : null,
          nextCursor: null,
          bank: { pendingSeconds: 0, authorizedSeconds: 0, rejectedSeconds: 0 },
          serverTime: "2026-10-11T18:00:00Z",
          timeZone: "America/Mexico_City",
          abnormalAfterSeconds: 43200,
        },
      },
    }),
  );
  await page.route("**/api/attendance/open?**", (route) =>
    route.fulfill({ json: { data: { items: [], nextCursor: null } } }),
  );
  await page.route("**/api/attendance/check-in", async (route) => {
    expect(route.request().postDataJSON()).toEqual({});
    recorded = true;
    await route.fulfill({ json: { data: open } });
  });
  await page.goto("/portal/asistencia");
  await page
    .getByRole("button", { name: "Registrar entrada", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Registrar salida", exact: true }),
  ).toBeVisible();
  expect(recorded).toBe(true);
  expect(
    await page.evaluate(() => JSON.stringify(sessionStorage)),
  ).not.toContain("latitude");
});
const visitId = "a".repeat(30),
  code = "b".repeat(64),
  itemId = "c".repeat(25);
async function setup(page: Page, authorized = true) {
  await installBackend2Api(page);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        data: {
          id: 5,
          codigo: "SYNTHETIC-ADMIN",
          email: "synthetic@ares.test",
          rol: authorized ? "ADMIN" : "PRESTADOR",
          estado: "ACTIVA",
          sedeId: 1,
          areaId: 2,
          turnoId: 3,
          permissions: authorized
            ? Object.fromEntries(
                [
                  "visits:request",
                  "visits:control",
                  "visits:manage",
                  "inventory:read",
                  "inventory:manage",
                  "inventory:loan",
                  "audit:read",
                  "audit:export",
                  "operations:read",
                  "operations:manage",
                  "recovery:read",
                  "recovery:manage",
                  "recovery:execute",
                  "attendance:manage",
                  "hours:validate",
                ].map((p) => [p, "global"]),
              )
            : {},
        },
      },
    }),
  );
}
async function inventory(page: Page, asset = false) {
  await setup(page);
  await page.route("**/api/inventory/locations", (route) =>
    route.fulfill({ json: { data: [{ id: 1, nombre: "Almacén sintético" }] } }),
  );
  await page.route("**/api/inventory/items?**", (route) =>
    route.fulfill({
      json: {
        data: {
          items: [
            {
              id: itemId,
              codigo: "SYNTHETIC-1",
              nombre: asset ? "Laptop sintética" : "Filamento sintético",
              tipo: asset ? "ACTIVO" : "CONSUMIBLE",
              cantidadStock: asset ? "1" : "0.50",
              unidadMedida: asset ? null : "kg",
              estadoActivo: asset ? "DISPONIBLE" : null,
              version: 1,
              stockBajo: !asset,
              ubicacion: { nombre: "Almacén sintético" },
            },
          ],
          nextCursor: null,
        },
      },
    }),
  );
  await page.route("**/api/inventory/loans?**", (route) =>
    route.fulfill({ json: { data: { items: [], nextCursor: null } } }),
  );
}
test("visita requiere identificación física, no sólo QR", async ({ page }) => {
  await setup(page);
  let entered = false;
  await page.route("**/api/visits/check/**", (route) =>
    route.fulfill({
      json: {
        data: {
          id: visitId,
          nombreVisitante: "Visitante sintético",
          motivo: "Visita al laboratorio",
          institucionProcedencia: "Institución sintética",
          estado: entered ? "REGISTRADA_ENTRADA" : "EMITIDA",
          version: entered ? 2 : 1,
          validaDesde: "2026-10-11T12:00:00Z",
          validaHasta: "2026-10-11T23:00:00Z",
        },
      },
    }),
  );
  await page.route(`**/api/visits/${visitId}/check-in`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      version: 1,
      identificacionVerificada: true,
    });
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    entered = true;
    await route.fulfill({ status: 201, json: { data: { id: visitId } } });
  });
  await page.goto("/portal/visitas/control");
  await page.getByLabel("Código privado de visita").fill(code);
  await page.getByRole("button", { name: "Buscar código" }).click();
  await expect(
    page.getByText("Visitante sintético", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Registrar entrada verificada" })
    .click();
  expect(entered).toBe(false);
  await page.getByRole("checkbox", { name: /Verifiqué físicamente/ }).check();
  await page
    .getByRole("button", { name: "Registrar entrada verificada" })
    .click();
  await expect(
    page.getByRole("button", { name: "Registrar salida" }),
  ).toBeVisible();
  expect(entered).toBe(true);
});
test("QR privado se genera localmente y se conserva alternativa manual", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/visits/invitations?**", (route) =>
    route.fulfill({
      json: {
        data: {
          items: [
            {
              id: visitId,
              nombreVisitante: "Visitante sintético",
              estado: "EMITIDA",
              version: 1,
              validaDesde: "2026-10-11T12:00:00Z",
              validaHasta: "2026-10-11T23:00:00Z",
              code,
            },
          ],
          nextCursor: null,
        },
      },
    }),
  );
  await page.goto("/portal/visitas");
  await page.getByText("Mostrar QR privado", { exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Código QR privado de la visita" }),
  ).toBeVisible();
  await expect(page.getByText(`Código privado: ${code}`)).toBeVisible();
});
test("movimiento desconocido congela datos y reintenta exactamente la misma identidad", async ({
  page,
}) => {
  await inventory(page);
  const keys: string[] = [];
  const bodies: string[] = [];
  await page.route("**/api/inventory/movements", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    bodies.push(route.request().postData()!);
    if (keys.length === 1) await route.abort("failed");
    else await route.fulfill({ status: 201, json: { data: { version: 2 } } });
  });
  await page.goto("/portal/inventario");
  await expect(page.getByText("Stock bajo", { exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: "Registrar movimiento de Filamento sintético",
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cantidad (ajuste: delta con signo)").fill("2.25");
  await dialog
    .getByLabel("Motivo / revisión física")
    .fill("Recepción sintética privada");
  await dialog
    .getByRole("button", { name: "Confirmar operación de inventario" })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "RESULTADO_DESCONOCIDO",
  );
  await expect(
    dialog.getByLabel("Cantidad (ajuste: delta con signo)"),
  ).toBeDisabled();
  const storage = await page.evaluate(() => JSON.stringify(sessionStorage));
  expect(storage).not.toContain("Recepción sintética privada");
  await dialog
    .getByRole("button", {
      name: "Reintentar la misma operación sin cambiar datos",
    })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(bodies[0]).toBe(bodies[1]);
});
test("barrera activa anuncia modo lectura y sólo se oculta tras confirmar estado backend", async ({
  page,
}) => {
  await inventory(page);
  await page.route("**/api/inventory/movements", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "RECOVERY_WRITE_BARRIER_ACTIVE" },
    }),
  );
  await page.route("**/api/health/operating-mode", (route) =>
    route.fulfill({ json: { data: { readOnly: false } } }),
  );
  await page.goto("/portal/inventario");
  await page
    .getByRole("button", {
      name: "Registrar movimiento de Filamento sintético",
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cantidad (ajuste: delta con signo)").fill("1");
  await dialog
    .getByLabel("Motivo / revisión física")
    .fill("Movimiento sintético");
  await dialog
    .getByRole("button", { name: "Confirmar operación de inventario" })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Modo lectura");
  // Closing the modal keeps the pending identity; it does not discard or repeat the write.
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Modo Lectura / Mantenimiento Operativo",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Comprobar estado operativo" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Modo Lectura / Mantenimiento Operativo",
    }),
  ).toHaveCount(0);
});
test("captura por contingencia confirma pendiente, no horas autorizadas", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/attendance/review?**", (route) =>
    route.fulfill({ json: { data: { items: [], nextCursor: null } } }),
  );
  await page.route("**/api/attendance/contingency", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      userId: 7,
      date: "2026-10-08",
      ticket: "EXT-123",
    });
    await route.fulfill({
      status: 201,
      json: { data: { id: 1, status: "PENDIENTE", isContingency: true } },
    });
  });
  await page.goto("/portal/validaciones");
  await page
    .getByRole("button", { name: "Capturar asistencia por contingencia" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ID del prestador").fill("7");
  await dialog.getByLabel("Fecha reportada en México").fill("2026-10-08");
  await dialog.getByLabel("Entrada reportada").fill("2026-10-08T09:00");
  await dialog.getByLabel("Salida reportada").fill("2026-10-08T11:00");
  await dialog.getByLabel("Referencia externa del ticket").fill("EXT-123");
  await dialog.getByLabel(/Motivo \(/).fill("Caída sintética del sistema");
  await dialog
    .getByLabel(/Justificación \(/)
    .fill("No hubo conectividad durante la sesión sintética");
  await dialog
    .getByRole("button", { name: "Confirmar captura pendiente" })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Operación confirmada" }),
  ).toBeVisible();
});
test("auditoría filtra y verifica manifiesto sin exponer payloads", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/audit/events?**", (route) =>
    route.fulfill({
      json: {
        data: {
          items: [
            {
              id: "1",
              occurredAt: "2026-10-11T18:00:00Z",
              actorId: 5,
              module: "VISITS",
              action: "VISIT_ENTRY",
              result: "SUCCESS",
              correlationId: "synthetic-correlation",
            },
          ],
          total: 1,
        },
      },
    }),
  );
  await page.route("**/api/audit/manifests/2026-10-10/verify", (route) =>
    route.fulfill({ json: { data: { valid: true, issues: [] } } }),
  );
  await page.goto("/portal/admin/auditoria");
  await expect(
    page.getByRole("cell", { name: "VISIT_ENTRY", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Día UTC del manifiesto").fill("2026-10-10");
  await page.getByRole("button", { name: "Verificar integridad" }).click();
  await expect(page.getByRole("status")).toContainText("Integridad verificada");
});
test("operaciones programa reintento sin fingir ejecución ni salud SMTP", async ({
  page,
}) => {
  await setup(page);
  let retried = false;
  await page.route("**/api/operations/status", (route) =>
    route.fulfill({
      json: {
        data: {
          dependencies: {
            database: "connected",
            storage: "disabled",
            scanner: "disabled",
          },
          workers: { outbox: false },
          smtp: { enabled: false, connectivity: "disabled" },
          openAlerts: 0,
          openIncidents: 0,
        },
      },
    }),
  );
  await page.route("**/api/operations/jobs?**", (route) =>
    route.fulfill({
      json: {
        data: {
          items: [
            {
              id: "job-1",
              name: "Trabajo sintético",
              state: "RETRY_SCHEDULED",
              attempts: 1,
              maxAttempts: 3,
              nextAttemptAt: "2099-10-11T18:00:00Z",
              errorCode: null,
            },
          ],
          total: 1,
        },
      },
    }),
  );
  for (const resource of ["alerts", "incidents"])
    await page.route(`**/api/operations/${resource}?**`, (route) =>
      route.fulfill({ json: { data: [] } }),
    );
  await page.route("**/api/operations/absence-evaluation-issues?**", (route) =>
    route.fulfill({
      json: {
        data: {
          items: [
            {
              userId: 7,
              fecha: "2026-10-09T00:00:00Z",
              reason: "ASSIGNMENT_HISTORY_UNKNOWN",
            },
          ],
          total: 1,
        },
      },
    }),
  );
  let reprocessed = false;
  await page.route(
    "**/api/operations/absence-evaluation/reprocess",
    async (route) => {
      expect(route.request().headers()["idempotency-key"]).toMatch(
        /^[A-Za-z0-9_-]{16,100}$/,
      );
      expect(route.request().postDataJSON()).toEqual({
        date: "2026-10-09",
        reason: "Reevaluación sintética autorizada",
      });
      reprocessed = true;
      await route.fulfill({
        status: 201,
        json: { data: { scheduled: true, historicalInference: false } },
      });
    },
  );
  await page.route("**/api/operations/jobs/job-1/retry", async (route) => {
    retried = true;
    expect(route.request().postDataJSON()).toMatchObject({ attempts: 1 });
    await route.fulfill({
      status: 201,
      json: { data: { retryRequested: true } },
    });
  });
  await page.goto("/portal/admin/operaciones");
  await expect(page.getByText(/conectividad: disabled/)).toBeVisible();
  await expect(page.getByText(/Este sondeo no confirma entrega/)).toBeVisible();
  await page
    .getByLabel("Motivo de reintento de Trabajo sintético")
    .fill("Reintento sintético autorizado");
  await page
    .getByRole("button", { name: "Solicitar reintento programado" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Operación confirmada" }),
  ).toBeVisible();
  expect(retried).toBe(true);
  await expect(page.getByText(/ASSIGNMENT_HISTORY_UNKNOWN/)).toBeVisible();
  const reprocessButton = page.getByRole("button", {
    name: "Programar reevaluación",
    exact: true,
  });
  // La acción previa mantiene el formulario ocupado hasta terminar sus recargas.
  await expect(reprocessButton).toBeEnabled();
  const dateInput = page.getByLabel("Fecha inicial de reevaluación");
  const reasonInput = page.getByLabel("Motivo de reevaluación");
  const confirmation = page.getByLabel(
    /Confirmo que sólo se programa el worker/,
  );
  await dateInput.fill("2026-10-09");
  await reasonInput.fill("Reevaluación sintética autorizada");
  await confirmation.check();
  await expect(dateInput).toHaveValue("2026-10-09");
  await expect(reasonInput).toHaveValue("Reevaluación sintética autorizada");
  await expect(confirmation).toBeChecked();
  await reprocessButton.click();
  await expect.poll(() => reprocessed).toBe(true);
});
test("recuperación ofrece sólo preparación y vista previa, sin acciones destructivas", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/recovery/status", (route) =>
    route.fulfill({
      json: {
        data: {
          barrier: {
            active: true,
            snapshotAt: "2026-10-11T18:00:00Z",
            runId: "run-1",
          },
          run: { id: "run-1", state: "RESTORE_RECORDED" },
        },
      },
    }),
  );
  await page.route("**/api/recovery?**", (route) =>
    route.fulfill({
      json: {
        data: {
          items: [
            {
              id: "run-1",
              name: "Simulacro sintético",
              state: "RESTORE_RECORDED",
              scope: "IMPORTANTE",
              rpoTargetMinutes: 60,
              rtoTargetMinutes: 480,
              actualRpoMinutes: 12,
              actualRtoMinutes: 20,
            },
          ],
          total: 1,
        },
      },
    }),
  );
  await page.route("**/api/recovery/drills", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/recovery/run-1/reconciliation/preview", (route) =>
    route.fulfill({
      json: { data: { proposed: 2, planHash: "d".repeat(64) } },
    }),
  );
  await page.goto("/portal/admin/recuperacion");
  await page
    .getByRole("checkbox", { name: /sólo solicito la vista previa segura/ })
    .check();
  await page
    .getByRole("button", { name: "Generar vista previa de reconciliación" })
    .click();
  await expect(page.getByText(/No se ejecutó reconciliación/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Restaurar|Borrar|Descongelar|Ejecutar reconciliación/i,
    }),
  ).toHaveCount(0);
});
test("grants ausentes niegan servicios y consolas aunque el rol cliente fuera manipulable", async ({
  page,
}) => {
  await setup(page, false);
  await page.goto("/portal/inventario");
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Inventario", exact: true }),
  ).toHaveCount(0);
});
