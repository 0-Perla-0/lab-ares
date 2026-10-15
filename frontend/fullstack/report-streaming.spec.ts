import { randomUUID } from "node:crypto";
import { createConnection } from "mariadb";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, role: string) {
  await page.goto("/login");
  await page
    .getByLabel("Correo electrónico")
    .fill(`${role}-${test.info().project.name}@fullstack.example.test`);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Acceptance-Test-Only!2026");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/portal/);
}
test("real paginated CSV above 5000 rows is downloaded from the correctly signed private MinIO endpoint", async ({
  page,
}) => {
  const raw = process.env.ARES_FULLSTACK_DB_URL;
  if (!raw) throw new Error("Explicit isolated fixture DB URL required");
  const url = new URL(raw);
  if (
    !["mysql:", "mariadb:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !/_(test|ci)$/.test(url.pathname)
  )
    throw new Error(
      "Synthetic report fixtures require isolated localhost _test/_ci DB",
    );
  await login(page, "expedient");
  const subject = (await (await page.request.get("/api/auth/me")).json()).data;
  if (
    subject.email !==
    `expedient-${test.info().project.name}@fullstack.example.test`
  )
    throw new Error("Synthetic subject required");
  const upload = await page.request.post("/api/files", {
    multipart: {
      file: {
        name: "report-fixture.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7\n%%EOF"),
      },
    },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const fileId = (await upload.json()).data.id;
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/files/${fileId}`)).json()).data
          .status,
      { timeout: 60000 },
    )
    .toBe("DISPONIBLE");
  const engineDay: Record<string, string> = {
    chromium: "2026-09-15",
    firefox: "2026-09-16",
    webkit: "2026-09-17",
  };
  const date = engineDay[test.info().project.name];
  const fixtureAt = `${date} 12:00:00.000`,
    rows = 5001,
    suffix = randomUUID().slice(0, 8);
  const connection = await createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  });
  try {
    // Explicit synthetic-volume fixture, never a backfill of unknown real history.
    // File itself was uploaded/scanned through the real API before associations.
    await connection.beginTransaction();
    for (let i = 0; i < rows; i++) {
      const requirement = await connection.query(
        "INSERT INTO RequisitoDocumento (usuarioId,codigo,nombre,obligatorio,activo,createdAt,updatedAt) VALUES (?,?,?,1,1,?,?)",
        [
          subject.id,
          `STREAM-${suffix}-${i}`,
          "Synthetic streaming volume",
          fixtureAt,
          fixtureAt,
        ],
      );
      await connection.query(
        "INSERT INTO DocumentoVersion (id,requisitoId,archivoId,version,estado,cargadoPorId,reportSedeId,reportAreaId,reportSnapshotAt,createdAt,updatedAt) VALUES (?,?,?,1,'EN_REVISION',?,?,?,?,?,?)",
        [
          `c${randomUUID().replaceAll("-", "").slice(0, 29)}`,
          Number(requirement.insertId),
          fileId,
          subject.id,
          subject.sedeId,
          subject.areaId,
          fixtureAt,
          fixtureAt,
          fixtureAt,
        ],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
  await login(page, "admin");
  const request = await page.request.post("/api/reports/export", {
    data: {
      type: "DOCUMENTS",
      from: `${date}T11:59:59.000Z`,
      to: `${date}T12:00:01.000Z`,
    },
  });
  expect(request.status(), await request.text()).toBe(202);
  const job = (await request.json()).data;
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/reports/export/${job.id}/status`)
          ).json()
        ).data.status,
      { timeout: 90000 },
    )
    .toBe("COMPLETADO");
  const capability = await page.request.get(
    `/api/reports/export/${job.id}/download`,
  );
  expect(capability.ok(), await capability.text()).toBe(true);
  const signed = (await capability.json()).data;
  const download = await page.request.get(signed);
  expect(download.ok()).toBe(true);
  const body = await download.body(),
    text = body.toString("utf8");
  expect(body.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  expect(text.split("\uFEFF")).toHaveLength(2);
  expect(text.split("\r\n").filter(Boolean)).toHaveLength(rows + 1);
  expect(text).not.toContain(subject.email);
  expect(
    (
      await (
        await page.request.get(`/api/reports/export/${job.id}/status`)
      ).json()
    ).data.totalFilas,
  ).toBe(rows);
  // The private object cannot be read by stripping the capability signature.
  const unsigned = new URL(signed);
  unsigned.search = "";
  expect((await page.request.get(unsigned.toString())).status()).toBe(403);
});
