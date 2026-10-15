import { createHmac, randomUUID } from "node:crypto";
import { createConnection } from "mariadb";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const password = "Acceptance-Test-Only!2026";
async function login(page: Page, role: string) {
  await page.goto("/login");
  await page
    .getByLabel("Correo electrónico")
    .fill(`${role}-${test.info().project.name}@fullstack.example.test`);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
}
async function mutation(
  page: Page,
  path: string,
  data: object,
  method = "POST",
) {
  const response = await page.request.fetch(`/api/${path}`, {
    method,
    data,
    headers: { "Idempotency-Key": randomUUID() },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).data;
}
function totp(secret: string, step = Math.floor(Date.now() / 30000)) {
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    value = (value << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(counter).digest(),
    offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
async function ageOwnSyntheticSession(
  page: Page,
  kind: "assurance" | "absolute",
) {
  const raw = process.env.ARES_FULLSTACK_DB_URL;
  if (!raw)
    throw new Error(
      "Real server expiry/reauth acceptance requires ARES_FULLSTACK_DB_URL in a fresh synthetic stack",
    );
  const url = new URL(raw);
  if (
    !["mysql:", "mariadb:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !/_(test|ci)$/.test(url.pathname)
  )
    throw new Error(
      "Clock fixture must target an isolated localhost _test/_ci database",
    );
  const me = (await (await page.request.get("/api/auth/me")).json()).data;
  if (!me.email.endsWith("@fullstack.example.test"))
    throw new Error("Only synthetic acceptance accounts may be aged");
  const sessions = (await (await page.request.get("/api/auth/sessions")).json())
    .data;
  const current = sessions.find((row: { current: boolean }) => row.current);
  expect(current).toBeTruthy();
  const connection = await createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  });
  const deadline = Date.now() + 15000;
  try {
    // A Windows test host may run in Mexico local time while SQL DATETIME is
    // UTC. Use epoch parameters, never the connector's local Date serializer.
    await connection.query("SET time_zone = '+00:00'");
    const result =
      kind === "assurance"
        ? await connection.query(
            "UPDATE Session SET data = JSON_SET(data, '$.authenticatedAt', ?) WHERE id = ? AND userId = ?",
            [Date.now() - 16 * 60000, current.id, me.id],
          )
        : await connection.query(
            "UPDATE Session SET absoluteExpiresAt = FROM_UNIXTIME(? / 1000) WHERE id = ? AND userId = ?",
            [deadline, current.id, me.id],
          );
    expect(result.affectedRows).toBe(1);
  } finally {
    await connection.end();
  }
  return deadline;
}

test("real academic prerequisite, formalization form and durable replay", async ({
  page,
  browser,
}) => {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/portal/);
  const users = (await (await page.request.get("/api/users")).json()).data;
  const target = users.find(
    (row: { email: string }) =>
      row.email ===
      `expedient-${test.info().project.name}@fullstack.example.test`,
  );
  const input = { usuarioId: target.id, inicio: "2026-10-12" };
  const refused = await page.request.post("/api/documents/formalizations", {
    data: input,
    headers: { "Idempotency-Key": randomUUID() },
  });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error).toBe("ACADEMIC_FORMALIZATION_REQUIRED");
  const institution = await mutation(page, "academic/catalogs/institucion", {
    nombre: `Institution-${randomUUID()}`,
  });
  const unit = await mutation(page, "academic/catalogs/unidad", {
    nombre: "Synthetic unit",
    parentId: institution.id,
  });
  const program = await mutation(page, "academic/catalogs/programa", {
    nombre: "Synthetic program",
    parentId: unit.id,
  });
  const context = await browser.newContext();
  try {
    const owner = await context.newPage();
    await login(owner, "expedient");
    await expect(owner).toHaveURL(/\/portal/);
    const academic = await mutation(
      owner,
      "academic/profile/me",
      {
        institucionId: institution.id,
        unidadAcademicaId: unit.id,
        programaAcademicoId: program.id,
        inicio: "2026-01-01",
        fin: null,
        cohorteId: null,
      },
      "PUT",
    );
    await mutation(page, `academic/profile/requests/${academic.id}/confirm`, {
      accept: true,
    });
    await page.goto("/portal/expediente");
    await page
      .getByLabel("ID de usuario", { exact: true })
      .fill(String(target.id));
    await page.getByLabel("Fecha de inicio a formalizar").fill(input.inicio);
    const received = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/documents/formalizations") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Formalizar expediente", exact: true })
      .click();
    const response = await received;
    expect(response.ok(), await response.text()).toBe(true);
    const result = await response.json();
    await expect(
      page.getByText(institution.nombre, { exact: false }),
    ).toBeVisible();
    const replay = await page.request.post("/api/documents/formalizations", {
      data: response.request().postDataJSON(),
      headers: {
        "Idempotency-Key": response.request().headers()["idempotency-key"],
      },
    });
    expect(await replay.json()).toEqual(result);
    const history = (
      await (await owner.request.get("/api/documents/formalizations")).json()
    ).data;
    expect(history).toHaveLength(1);
    expect(history[0].academicSnapshot.programaId).toBe(program.id);
    await page
      .getByRole("button", { name: "Actualizar formalizaciones", exact: true })
      .click();
    await expect(
      page.getByLabel("Formalización de inicio").locator("option"),
    ).toHaveCount(2);
    await page
      .getByLabel("Formalización de inicio")
      .selectOption(result.data.id);
    await page.getByLabel("Fecha final del periodo").fill("2027-01-31");
    await page
      .getByLabel("Motivo administrativo (sin datos sensibles)")
      .fill("Registro operativo sintético autorizado");
    const registered = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/service-periods") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Registrar periodo operativo", exact: true })
      .click();
    const periodResponse = await registered;
    expect(periodResponse.ok(), await periodResponse.text()).toBe(true);
    const period = (await periodResponse.json()).data;
    const periodReplay = await owner.request.get(
      `/api/operation-intents/${periodResponse.request().headers()["idempotency-key"]}`,
    );
    expect((await periodReplay.json()).data.state).toBe("UNCONFIRMED");
    await page
      .getByRole("button", { name: "Preparar inicio", exact: true })
      .click();
    await page
      .getByLabel("Motivo administrativo (sin datos sensibles)")
      .fill("Inicio operativo sintético autorizado");
    await page
      .getByRole("button", { name: "Confirmar transición", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Preparar cierre administrativo",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Preparar cierre administrativo",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Motivo administrativo (sin datos sensibles)")
      .fill("Cierre administrativo sin liberación legal");
    await page
      .getByRole("button", { name: "Confirmar transición", exact: true })
      .click();
    await expect(
      page.getByText("CERRADO", { exact: true }).first(),
    ).toBeVisible();
    const periods = (
      await (await owner.request.get("/api/service-periods")).json()
    ).data;
    expect(periods.items[0]).toMatchObject({
      id: period.id,
      estado: "CERRADO",
      version: 3,
    });
    expect(periods.items[0].eventos).toHaveLength(3);
  } finally {
    await context.close();
  }
});

test("real MFA login and recent-auth dialog never replay a sensitive operation", async ({
  page,
}) => {
  await login(page, "security");
  await expect(page).toHaveURL(/\/portal/);
  await page.goto("/portal/seguridad");
  await page
    .getByLabel("Confirma tu contraseña", { exact: true })
    .fill(password);
  const prepared = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/mfa/setup") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Preparar TOTP", exact: true })
    .click();
  const setup = (await (await prepared).json()).data;
  await page
    .getByLabel("Código TOTP", { exact: true })
    .fill(totp(setup.secret));
  const enabled = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/mfa/enable") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Confirmar activación", exact: true })
    .click();
  const codes = (await (await enabled).json()).data.recoveryCodes;
  expect(codes).toHaveLength(10);
  await page.request.post("/api/auth/logout");
  await login(page, "security");
  await expect(
    page.getByRole("button", { name: "Verificar y entrar" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Usar un código de recuperación",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Código de recuperación", { exact: true })
    .fill(codes[0]);
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await expect(page).toHaveURL(/\/portal/);
  await page.goto("/portal/seguridad");
  await ageOwnSyntheticSession(page, "assurance");
  let submissions = 0;
  page.on("request", (request) => {
    if (
      request.method() === "DELETE" &&
      request.url().endsWith("/api/auth/sessions/others")
    )
      submissions++;
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Cerrar las demás sesiones", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Confirma tu identidad" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Cerrar", exact: true }),
  ).toBeFocused();
  const currentStep = Math.floor(Date.now() / 30000);
  const validCodes = [-1, 0, 1].map((offset) =>
    totp(setup.secret, currentStep + offset),
  );
  const bad = ["000000", "000001", "000002", "000003"].find(
    (code) => !validCodes.includes(code),
  )!;
  await dialog.getByLabel("Código TOTP").fill(bad);
  await dialog.getByRole("button", { name: "Confirmar identidad" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect((await page.request.get("/api/auth/me")).ok()).toBe(true);
  await dialog
    .getByLabel("Código TOTP")
    .fill(totp(setup.secret, Math.floor(Date.now() / 30000) + 1));
  await dialog.getByRole("button", { name: "Confirmar identidad" }).click();
  await expect(dialog).not.toBeVisible();
  expect(submissions).toBe(1);
  await page
    .getByRole("button", { name: "Cerrar las demás sesiones", exact: true })
    .click();
  await expect.poll(() => submissions).toBe(2);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Operación confirmada por el servidor." }),
  ).toBeVisible();
});

test("real password reauthentication preserves the session after a wrong password", async ({
  page,
}) => {
  await login(page, "reauth");
  await expect(page).toHaveURL(/\/portal/);
  await page.goto("/portal/seguridad");
  await expect(
    page.getByRole("heading", { name: "Seguridad de mi cuenta" }),
  ).toBeVisible();
  await ageOwnSyntheticSession(page, "assurance");
  let submissions = 0;
  page.on("request", (request) => {
    if (
      request.method() === "DELETE" &&
      request.url().endsWith("/api/auth/sessions/others")
    )
      submissions++;
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Cerrar las demás sesiones", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Confirma tu identidad" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Contraseña actual").fill("Wrong-password-only!2026");
  await dialog.getByRole("button", { name: "Confirmar identidad" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/portal\/seguridad$/);
  expect((await page.request.get("/api/auth/me")).ok()).toBe(true);
  await dialog.getByLabel("Contraseña actual").fill(password);
  await dialog.getByRole("button", { name: "Confirmar identidad" }).click();
  await expect(dialog).not.toBeVisible();
  expect(submissions).toBe(1);
  await page
    .getByRole("button", { name: "Cerrar las demás sesiones", exact: true })
    .click();
  await expect.poll(() => submissions).toBe(2);
});

test("real server absolute expiry is announced without passive keepalive", async ({
  page,
}) => {
  await login(page, "expiry");
  await expect(page).toHaveURL(/\/portal/);
  const deadline = await ageOwnSyntheticSession(page, "absolute");
  await page.goto("/portal/seguridad");
  const warning = page.getByRole("region", { name: "Caducidad de sesión" });
  await expect(warning).toBeVisible();
  let passiveRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/")) passiveRequests++;
  });
  await expect
    .poll(() => Date.now() >= deadline + 1000, {
      timeout: 30000,
      intervals: [1000],
    })
    .toBe(true);
  expect(passiveRequests).toBe(0);
  await warning
    .getByRole("button", { name: "Verificar y mantener actividad" })
    .click();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});

test("automated WCAG 2.2 AA critical pages use real DOM and APIs", async ({
  page,
}) => {
  await login(page, "prestador");
  await expect(page).toHaveURL(/\/portal/);
  for (const [path, heading] of [
    ["/portal/asistencia", "Asistencia"],
    ["/portal/expediente", "Expediente documental"],
    ["/portal/seguridad", "Seguridad de mi cuenta"],
    ["/portal/perfil-academico", "Perfil académico"],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    await test.info().attach(`axe-${path.split("/").at(-1)}`, {
      body: JSON.stringify(result),
      contentType: "application/json",
    });
    expect(result.violations, path).toEqual([]);
  }
});
