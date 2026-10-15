import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

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
async function mutate(
  page: Page,
  path: string,
  body: object,
  key: string = randomUUID(),
) {
  const response = await page.request.post(`/api/${path}`, {
    data: body,
    headers: { "Idempotency-Key": key },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).data;
}
test("real attendance: browser session, advisory fallback, replay and private signals", async ({
  page,
}) => {
  await login(page, "prestador");
  await page.goto("/portal/asistencia");
  const receivedEntry = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/attendance/check-in") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Registrar entrada", exact: true })
    .click();
  const entryResponse = await receivedEntry;
  expect(entryResponse.ok(), await entryResponse.text()).toBe(true);
  const entry = (await entryResponse.json()).data;
  const key = entryResponse.request().headers()["idempotency-key"];
  expect(
    await mutate(
      page,
      "attendance/check-in",
      entryResponse.request().postDataJSON(),
      key,
    ),
  ).toEqual(entry);
  expect(JSON.stringify(entry)).not.toMatch(/geoLatitude|clientIp/);
  const denied = await page.request.get(`/api/attendance/${entry.id}/signals`);
  expect(denied.status()).toBe(403);
  const receivedExit = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/attendance/check-out") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Registrar salida", exact: true })
    .click();
  expect((await receivedExit).ok()).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /asistencia/i }).first(),
  ).toBeVisible();
});
test("real visits and inventory preserve identification and stock transactions", async ({
  page,
}) => {
  await login(page, "coordinador");
  const me = (await (await page.request.get("/api/auth/me")).json()).data;
  const from = new Date(Date.now() - 60000),
    until = new Date(Date.now() + 3600000);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(from);
  const invitation = await mutate(page, "visits/invitations", {
    sedeId: me.sedeId,
    areaId: me.areaId,
    nombreVisitante: "Visitante sintético",
    motivo: "Ensayo integral",
    fechaProgramada: date,
    validaDesde: from.toISOString(),
    validaHasta: until.toISOString(),
  });
  expect(
    (
      await page.request.post(`/api/visits/${invitation.id}/check-in`, {
        data: { version: invitation.version },
        headers: { "Idempotency-Key": randomUUID() },
      })
    ).status(),
  ).toBe(400);
  const entered = await mutate(page, `visits/${invitation.id}/check-in`, {
    version: invitation.version,
    identificacionVerificada: true,
  });
  await mutate(page, `visits/${invitation.id}/check-out`, {
    version: entered.version,
  });
  const location = await mutate(page, "inventory/locations", {
    sedeId: me.sedeId,
    areaId: me.areaId,
    codigo: randomUUID(),
    nombre: "Ensayo integral",
    reason: "Alta de ensayo",
  });
  const item = await mutate(page, "inventory/items", {
    codigo: randomUUID(),
    nombre: "Consumible sintético",
    tipo: "CONSUMIBLE",
    unidadMedida: "pieza",
    ubicacionId: location.id,
    reason: "Alta de ensayo",
  });
  const movement = await mutate(page, "inventory/movements", {
    articuloId: item.id,
    version: item.version,
    tipo: "ENTRADA",
    cantidad: 2.12,
    motivo: "Entrada sintética",
  });
  expect(Number(movement.cantidadStock)).toBe(2.12);
  await page.goto("/portal/inventario");
  await expect(page.getByText("Consumible sintético").first()).toBeVisible();
});
test("real private upload is scanned by ClamAV and not exposed to another account", async ({
  page,
}) => {
  await login(page, "prestador");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==",
    "base64",
  );
  const uploaded = await page.request.post("/api/files", {
    multipart: {
      file: { name: "synthetic.png", mimeType: "image/png", buffer: png },
    },
  });
  expect(uploaded.ok(), await uploaded.text()).toBe(true);
  const file = (await uploaded.json()).data;
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/files/${file.id}`)).json()).data
          .status,
      { timeout: 90000 },
    )
    .toBe("DISPONIBLE");
  const absences = (await (await page.request.get("/api/absences/me")).json())
    .data.items;
  const absence = absences.find(
    (row: { estado: string }) => row.estado === "PENDIENTE_JUSTIFICACION",
  );
  expect(absence).toBeTruthy();
  const submitted = await mutate(page, `absences/${absence.id}/justify`, {
    version: absence.version,
    motivo: "Justificación sintética escaneada",
    archivoId: file.id,
  });
  await page.request.post("/api/auth/logout");
  await login(page, "coordinador");
  const denied = await page.request.get(`/api/files/${file.id}`);
  expect([403, 404]).toContain(denied.status());
  await mutate(page, `absences/${absence.id}/resolve`, {
    version: submitted.version,
    decision: "JUSTIFICADA",
    motivo: "Resolución de ensayo integral",
  });
});
test("real SMTP connectivity, worker cycles and mail delivery", async ({
  page,
}) => {
  await login(page, "admin");
  const status = (
    await (await page.request.get("/api/operations/status")).json()
  ).data;
  expect(status.dependencies).toMatchObject({
    database: "connected",
    storage: "connected",
    scanner: "connected",
  });
  expect(status.smtp.connectivity).toBe("connected");
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/operations/status")).json()).data
          .workerHealth.outbox?.stale,
    )
    .toBe(false);
  const invitation = await mutate(page, "invitations", {
    targetEmail: `synthetic-${randomUUID()}@example.test`,
    role: "PRESTADOR",
  });
  expect(invitation.id).toBeTruthy();
  const mailpit = process.env.ARES_MAILPIT_URL ?? "http://localhost:8025";
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(mailpit))
    throw new Error("Mailpit must target isolated localhost");
  await expect
    .poll(
      async () => {
        const messages = await (
          await page.request.get(`${mailpit}/api/v1/messages`)
        ).json();
        return (messages.messages as { To: { Address: string }[] }[]).some(
          (message) =>
            message.To.some((to) => to.Address === invitation.targetEmail),
        );
      },
      { timeout: 60000 },
    )
    .toBe(true);
});

test("real upload rejects forged signatures and ClamAV isolates the harmless EICAR test sample", async ({
  page,
}) => {
  await login(page, "prestador");
  const forged = await page.request.post("/api/files", {
    multipart: {
      file: {
        name: "forged.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("This is not a PDF"),
      },
    },
  });
  expect(forged.status()).toBe(400);
  // Standard non-malicious scanner test signature, never executable content.
  const sample = Buffer.from(
    "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    "ascii",
  );
  const uploaded = await page.request.post("/api/files", {
    multipart: {
      file: {
        name: "scanner-test.txt",
        mimeType: "text/plain",
        buffer: sample,
      },
    },
  });
  expect(uploaded.ok(), await uploaded.text()).toBe(true);
  const file = (await uploaded.json()).data;
  await expect
    .poll(
      async () => {
        const metadata = await page.request.get(`/api/files/${file.id}`);
        expect(metadata.ok(), await metadata.text()).toBe(true);
        const value = (await metadata.json()).data;
        expect(JSON.stringify(value)).not.toMatch(
          /objectKey|quarantineKey|lastError/,
        );
        return value.status;
      },
      { timeout: 45000, intervals: [1000, 2000, 4000] },
    )
    .toBe("RECHAZADO");
  await page.request.post("/api/auth/logout");
  await login(page, "coordinador");
  const denied = await page.request.get(`/api/files/${file.id}`);
  expect(denied.status()).toBe(404);
});
