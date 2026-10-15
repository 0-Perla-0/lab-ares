import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function login(page: Page, role: string) {
  await page.goto("/login");
  await page
    .getByLabel("Correo electrónico")
    .fill(`${role}-${test.info().project.name}@fullstack.example.test`);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Acceptance-Test-Only!2026");
  await page.getByRole("button", { name: /iniciar sesión|ingresar/i }).click();
  await expect(page).toHaveURL(/\/portal/);
}

test("real administrative recovery form commits once without revealing credentials", async ({
  page,
}) => {
  await login(page, "admin");
  const users = (await (await page.request.get("/api/users")).json()).data;
  const target = users.find(
    (user: { email: string }) =>
      user.email ===
      `prestador-${test.info().project.name}@fullstack.example.test`,
  );
  expect(target).toBeTruthy();
  await page.goto(`/portal/usuarios/${target.id}`);
  const recovery = page.getByRole("heading", {
    name: "Recuperación administrativa",
    exact: true,
  });
  await expect(recovery).toBeVisible();
  await page
    .getByLabel("Referencia de verificación institucional")
    .fill(`UI-${test.info().project.name}`);
  await page
    .getByLabel("Motivo de recuperación")
    .fill("Verificación institucional sintética de aceptación");
  await page
    .getByLabel("Verifiqué la identidad según el procedimiento institucional")
    .check();
  const received = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/users/${target.id}/recovery`) &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Solicitar recuperación y revocar sesiones" })
    .click();
  const response = await received;
  expect(response.ok(), await response.text()).toBe(true);
  const result = await response.json();
  expect(result.data.sessionsRevoked).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(
    /tokenHash|passwordHash|secretCiphertext|recoveryCodes/,
  );
  const replay = await page.request.post(`/api/users/${target.id}/recovery`, {
    data: response.request().postDataJSON(),
    headers: {
      "Idempotency-Key": response.request().headers()["idempotency-key"],
    },
  });
  expect(replay.ok()).toBe(true);
  expect(await replay.json()).toEqual(result);
});

test("real audited feature form pauses new visits without changing RBAC", async ({
  page,
  browser,
}) => {
  await login(page, "admin");
  await page.goto("/portal/admin/operaciones");
  await expect(
    page.getByRole("heading", {
      name: "Políticas de habilitación",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Módulo o función").selectOption("VISITS.REQUEST");
  await page.getByLabel("Permitir nuevo trabajo").uncheck();
  await page
    .getByLabel("Motivo y referencia de autorización")
    .fill("Pausa sintética aislada de aceptación, sin activación productiva");
  const received = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith("/api/operations/feature-policies/VISITS.REQUEST") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publicar nueva versión" }).click();
  const response = await received;
  expect(response.ok(), await response.text()).toBe(true);
  const published = (await response.json()).data;
  const context = await browser.newContext();
  try {
    const coordinator = await context.newPage();
    await login(coordinator, "coordinador");
    const me = (await (await coordinator.request.get("/api/auth/me")).json())
      .data;
    expect(me.capabilities["VISITS.REQUEST"]).toBe(false);
    expect(me.permissions["visits:request"]).toBe("area");
    await coordinator.goto("/portal/visitas");
    await coordinator
      .getByText("Crear invitación privada", { exact: true })
      .click();
    await expect(coordinator.locator("fieldset").first()).toHaveAttribute(
      "disabled",
      "",
    );
    await expect(
      coordinator.getByLabel("ID sede", { exact: true }),
    ).toBeDisabled();
    await expect(
      coordinator.getByLabel("ID área", { exact: true }),
    ).toBeDisabled();
    const blocked = await coordinator.request.post("/api/visits/invitations", {
      data: {},
      headers: { "Idempotency-Key": "ui-policy-denied" },
    });
    expect(blocked.status()).toBe(404);
    expect((await blocked.json()).error).toBe("FEATURE_OUTSIDE_PILOT");
  } finally {
    await context.close();
    const restored = await page.request.post(
      "/api/operations/feature-policies/VISITS.REQUEST",
      {
        headers: {
          "Idempotency-Key": randomUUID(),
        },
        data: {
          expectedVersion: published.version,
          enabled: true,
          sedeIds: [],
          areaIds: [],
          userIds: [],
          reason: "Restaurar el default del entorno sintético aislado",
        },
      },
    );
    expect(restored.ok(), await restored.text()).toBe(true);
  }
});
