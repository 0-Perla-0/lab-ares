import { describe, expect, it, vi, beforeEach } from "vitest";
import { ReportsService } from "../src/reports/reports.service";
import {
  EstadoArchivo,
  EstadoReporteExportacion,
  EstadoUsuario,
  RolUsuario,
  TipoReporteExportacion,
} from "../src/generated/prisma/enums";
import type { AuthUser } from "../src/auth/auth-user";
import { AccessScope } from "../src/auth/permissions";

const actor = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 7,
  codigo: "U7",
  email: "u7@test.local",
  rol: RolUsuario.COORDINADOR,
  estado: EstadoUsuario.ACTIVA,
  areaId: 10,
  sedeId: 20,
  turnoId: null,
  ...overrides,
});
const now = new Date("2026-01-31T12:00:00.000Z");
const baseJob = {
  id: "cmabcdefghijklmnopqrstuvwx",
  requesterId: 7,
  type: TipoReporteExportacion.ATTENDANCE,
  filters: {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-01-31T00:00:00.000Z",
    scope: AccessScope.AREA,
    sedeId: 20,
    areaId: 10,
  },
  status: EstadoReporteExportacion.COMPLETADO,
  totalFilas: 1,
  archivoId: "cmfileabcdefghijklmnopqr",
  expiresAt: new Date("2026-02-01T00:00:00.000Z"),
  attempts: 0,
  nextAttemptAt: null,
};

function make(overrides: any = {}) {
  const attendance = [
    {
      id: "a1",
      userId: 7,
      status: "PRESENTE",
      checkInAt: now,
      checkOutAt: null,
      durationSeconds: 10,
    },
  ];
  const base: any = {
    asistencia: {
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue(attendance),
    },
    documentoVersion: {
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    actividadKairos: {
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    reporteExportacion: {
      create: vi.fn().mockResolvedValue({
        ...baseJob,
        status: EstadoReporteExportacion.PENDIENTE,
      }),
      findFirst: vi.fn().mockResolvedValue(baseJob),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    usuario: { findUnique: vi.fn().mockResolvedValue({ ...actor() }) },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const db: any = { ...base, ...overrides };
  for (const key of [
    "asistencia",
    "documentoVersion",
    "actividadKairos",
    "reporteExportacion",
    "usuario",
  ])
    db[key] = { ...base[key], ...(overrides[key] ?? {}) };
  db.$transaction = overrides.$transaction ?? vi.fn((fn: any) => fn(db));
  const audit = { append: vi.fn().mockResolvedValue(undefined) };
  const storage = {
    downloadUrl: vi.fn().mockResolvedValue({ url: "private" }),
    storeGeneratedCsv: vi
      .fn()
      .mockResolvedValue({ id: "cmfileabcdefghijklmnopqr" }),
    removeGenerated: vi.fn().mockResolvedValue(undefined),
  };
  return {
    service: new ReportsService(db, audit as any, storage as any),
    db,
    audit,
    storage,
  };
}

describe("operational reports contracts", () => {
  beforeEach(() => vi.useRealTimers());
  it.each([RolUsuario.COORDINADOR, RolUsuario.JEFE_AREA])(
    "allows area report scope for %s",
    async (rol) => {
      const { service } = make();
      await expect(service.metrics(actor({ rol }), {})).resolves.toBeDefined();
    },
  );
  it.each([
    RolUsuario.JEFE_SEDE,
    RolUsuario.ADMIN,
    RolUsuario.JEFE_COORDINADORES,
  ])("allows global/se de report scope for %s", async (rol) => {
    const { service } = make();
    await expect(service.metrics(actor({ rol }), {})).resolves.toBeDefined();
  });
  it("rejects inactive actors", async () => {
    const { service } = make();
    await expect(
      service.metrics(actor({ estado: EstadoUsuario.SUSPENDIDA }), {}),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects an area actor without required dimensions", async () => {
    const { service } = make();
    await expect(
      service.metrics(actor({ areaId: null, sedeId: null }), {}),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("defaults metrics to a 30-day range and uses inclusive/exclusive boundaries", async () => {
    const { service, db } = make();
    vi.setSystemTime(now);
    await service.metrics(actor(), {});
    expect(db.asistencia.groupBy.mock.calls[0][0].where.checkInAt).toEqual({
      gte: new Date("2026-01-01T12:00:00.000Z"),
      lt: now,
    });
  });
  it("accepts from inclusive and to exclusive dates", async () => {
    const { service, db } = make();
    await service.metrics(actor(), {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
    });
    expect(db.asistencia.groupBy.mock.calls[0][0].where.checkInAt).toEqual({
      gte: new Date("2026-01-01T00:00:00.000Z"),
      lt: new Date("2026-01-02T00:00:00.000Z"),
    });
  });
  it("rejects reversed and over-365-day ranges", async () => {
    const { service } = make();
    await expect(
      service.metrics(actor(), {
        from: "2026-02-01T00:00:00.000Z",
        to: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.metrics(actor(), {
        from: "2025-01-01T00:00:00.000Z",
        to: "2026-01-02T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("passes scoped sede and area predicates to attendance and documents", async () => {
    const { service, db } = make();
    await service.metrics(actor(), {});
    expect(db.asistencia.groupBy.mock.calls[0][0].where.user).toEqual({
      estado: EstadoUsuario.ACTIVA,
      sedeId: 20,
      areaId: 10,
    });
    expect(
      db.documentoVersion.groupBy.mock.calls[0][0].where.requisito.usuario,
    ).toEqual({ estado: EstadoUsuario.ACTIVA, sedeId: 20, areaId: 10 });
  });
  it("scopes each Kairos activity through its responsible user organization", async () => {
    const { service, db } = make();
    await service.metrics(actor(), {});
    expect(
      db.actividadKairos.groupBy.mock.calls[0][0].where.responsable,
    ).toEqual({ estado: EstadoUsuario.ACTIVA, sedeId: 20, areaId: 10 });
  });
  it("documents overdue semantics in the response", async () => {
    const { service } = make();
    await expect(service.metrics(actor(), {})).resolves.toMatchObject({
      semantics: expect.stringContaining("overdue"),
    });
  });
  it("exports attendance synchronously at exactly 5000 rows", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      id: `a${i}`,
      userId: 7,
      status: "PRESENTE",
      checkInAt: now,
      checkOutAt: null,
      durationSeconds: 1,
    }));
    const { service, db } = make({
      asistencia: {
        count: vi.fn().mockResolvedValue(5000),
        findMany: vi.fn().mockResolvedValue(rows),
      },
    });
    const out: any = await service.requestExport(actor(), {
      type: "ATTENDANCE",
    });
    expect(out.sync).toBe(true);
    expect(db.reporteExportacion.create).not.toHaveBeenCalled();
  });
  it("counts first and never materializes rows above 5000", async () => {
    const { service, db } = make({
      asistencia: { count: vi.fn().mockResolvedValue(5001) },
    });
    const out: any = await service.requestExport(actor(), {
      type: "ATTENDANCE",
    });
    expect(out.sync).toBe(false);
    expect(db.asistencia.findMany).not.toHaveBeenCalled();
    expect(db.reporteExportacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filters: expect.objectContaining({
            scope: AccessScope.AREA,
            sedeId: 20,
            areaId: 10,
          }),
        }),
      }),
    );
  });
  it("emits CSV headers, BOM-safe text, escaping and CRLF", async () => {
    const row = {
      id: 'a"1',
      userId: 7,
      status: "=FORMULA",
      checkInAt: now,
      checkOutAt: null,
      durationSeconds: 1,
    };
    const { service } = make({
      asistencia: { findMany: vi.fn().mockResolvedValue([row]) },
    });
    const out: any = await service.requestExport(actor(), {
      type: "ATTENDANCE",
    });
    const csv = out.body.toString("utf8");
    expect(csv).toContain('"id","userId","status"');
    expect(csv).toContain("'=FORMULA");
    expect(csv).toContain("\r\n");
    expect(csv).toContain('"a""1"');
  });
  it("removes newlines and neutralizes all formula-leading CSV values", async () => {
    const { service } = make({
      asistencia: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "a",
            userId: 7,
            status: "@x\nnext",
            checkInAt: now,
            checkOutAt: null,
            durationSeconds: 1,
          },
        ]),
      },
    });
    const out: any = await service.requestExport(actor(), {
      type: "ATTENDANCE",
    });
    expect(out.body.toString()).toContain("'@x next");
  });
  it("does not expose raw email or PII in selected export fields", async () => {
    const { service, db } = make();
    await service.requestExport(actor(), { type: "ATTENDANCE" });
    expect(db.asistencia.findMany.mock.calls[0][0].select).toEqual(
      expect.not.objectContaining({
        email: expect.anything(),
        nombre: expect.anything(),
      }),
    );
  });
  it("audits synchronous export request and completion", async () => {
    const { service, audit } = make();
    await service.requestExport(actor(), { type: "ATTENDANCE" });
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REPORT_EXPORT_REQUESTED",
        metadata: expect.objectContaining({ mode: "sync" }),
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REPORT_EXPORT_COMPLETED",
        metadata: expect.objectContaining({ mode: "sync" }),
      }),
    );
  });
  it("restricts status and download to the requesting owner", async () => {
    const { service, db } = make();
    db.reporteExportacion.findFirst.mockResolvedValue(null);
    await expect(
      service.status(actor({ id: 8 }), baseJob.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.download(actor(), baseJob.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("denies expired downloads", async () => {
    const { service } = make({
      reporteExportacion: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ ...baseJob, expiresAt: new Date("2025-01-01") }),
      },
    });
    await expect(service.download(actor(), baseJob.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("audits async export requests and downloads", async () => {
    const { service, audit, db } = make({
      asistencia: { count: vi.fn().mockResolvedValue(5001) },
    });
    await service.requestExport(actor(), { type: "ATTENDANCE" });
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REPORT_EXPORT_REQUESTED" }),
      expect.anything(),
    );
    db.reporteExportacion.findFirst.mockResolvedValue({
      ...baseJob,
      expiresAt: new Date("2099-02-01"),
    });
    await service.download(actor(), baseJob.id);
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REPORT_EXPORT_DOWNLOADED" }),
      expect.anything(),
    );
  });
  it("claims a pending job with a lease and skips a lost race", async () => {
    const { service, db } = make();
    db.reporteExportacion.findMany.mockResolvedValue([
      { ...baseJob, status: EstadoReporteExportacion.PENDIENTE },
    ]);
    db.reporteExportacion.updateMany.mockResolvedValueOnce({ count: 0 });
    await service.processDue();
    expect(db.reporteExportacion.updateMany).toHaveBeenCalled();
  });
  it("revalidates requester status before generation", async () => {
    const { service, db } = make();
    db.reporteExportacion.findMany.mockResolvedValue([
      { ...baseJob, status: EstadoReporteExportacion.PENDIENTE },
    ]);
    db.reporteExportacion.updateMany.mockResolvedValue({ count: 1 });
    db.usuario.findUnique.mockResolvedValue({
      ...actor(),
      estado: EstadoUsuario.SUSPENDIDA,
    });
    await service.processDue();
    expect(db.reporteExportacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leaseOwner: expect.any(String) }),
        data: expect.objectContaining({
          status: EstadoReporteExportacion.FALLIDO,
          errorCode: "REQUESTER_INACTIVE",
        }),
      }),
    );
  });
  it("revalidates requester export permission and scope before generation", async () => {
    const { service, db } = make();
    db.reporteExportacion.findMany.mockResolvedValue([
      { ...baseJob, status: EstadoReporteExportacion.PENDIENTE },
    ]);
    db.reporteExportacion.updateMany.mockResolvedValue({ count: 1 });
    db.usuario.findUnique.mockResolvedValue({
      ...actor(),
      rol: RolUsuario.PRESTADOR,
    });
    await service.processDue();
    expect(db.reporteExportacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EstadoReporteExportacion.FALLIDO,
          errorCode: "REPORT_PERMISSION_REVOKED",
        }),
      }),
    );
  });
  it("fails permanently when the requester organization scope changed", async () => {
    const { service, db } = make();
    db.reporteExportacion.findMany.mockResolvedValue([
      { ...baseJob, status: EstadoReporteExportacion.PENDIENTE },
    ]);
    db.reporteExportacion.updateMany.mockResolvedValue({ count: 1 });
    db.usuario.findUnique.mockResolvedValue({ ...actor(), areaId: 99 });
    await service.processDue();
    expect(db.reporteExportacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EstadoReporteExportacion.FALLIDO,
          errorCode: "REPORT_SCOPE_CHANGED",
          nextAttemptAt: null,
        }),
      }),
    );
  });
  it("generates a private file with owner metadata and completion audit", async () => {
    const { service, storage, audit } = make({
      reporteExportacion: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { ...baseJob, status: EstadoReporteExportacion.PENDIENTE },
          ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });
    await service.processDue();
    expect(storage.storeGeneratedCsv).toHaveBeenCalledWith(
      7,
      baseJob.id,
      expect.any(Buffer),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REPORT_EXPORT_COMPLETED" }),
      expect.anything(),
    );
  });
  it("removes a generated file when the completion lease is lost", async () => {
    const updates = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const { service, storage } = make({
      reporteExportacion: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { ...baseJob, status: EstadoReporteExportacion.PENDIENTE },
          ]),
        updateMany: updates,
      },
    });
    await service.processDue();
    expect(storage.removeGenerated).toHaveBeenCalledWith(
      "cmfileabcdefghijklmnopqr",
    );
  });
  it("marks generation failures retryable with backoff without a long transaction", async () => {
    const { service, db, storage } = make();
    db.reporteExportacion.findMany.mockResolvedValue([
      { ...baseJob, status: EstadoReporteExportacion.PENDIENTE },
    ]);
    db.reporteExportacion.updateMany.mockResolvedValue({ count: 1 });
    storage.storeGeneratedCsv.mockRejectedValue(new Error("S3_DOWN"));
    await service.processDue();
    expect(db.reporteExportacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leaseOwner: expect.any(String) }),
        data: expect.objectContaining({
          status: EstadoReporteExportacion.PENDIENTE,
          errorCode: "S3_DOWN",
          nextAttemptAt: expect.any(Date),
        }),
      }),
    );
  });
  it("expires jobs and removes generated objects idempotently", async () => {
    const { service, storage, db } = make({
      reporteExportacion: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { ...baseJob, expiresAt: new Date("2025-01-01") },
          ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });
    await service.cleanup();
    await service.cleanup();
    expect(storage.removeGenerated).toHaveBeenCalledWith(baseJob.archivoId);
    expect(db.reporteExportacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: baseJob.id }),
        data: expect.objectContaining({
          status: EstadoReporteExportacion.EXPIRADO,
          archivoId: null,
        }),
      }),
    );
  });
  it("keeps an expired job retryable when private object deletion fails", async () => {
    const { service, storage, db } = make({
      reporteExportacion: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { ...baseJob, expiresAt: new Date("2025-01-01") },
          ]),
      },
    });
    storage.removeGenerated.mockRejectedValue(new Error("S3_DOWN"));
    db.reporteExportacion.updateMany.mockClear();
    await service.cleanup();
    expect(db.reporteExportacion.updateMany).not.toHaveBeenCalled();
  });
  it("validates strict report input schemas", async () => {
    const { exportSchema, rangeSchema } =
      await import("../src/reports/reports.schemas");
    expect(rangeSchema.safeParse({ from: "not-date" }).success).toBe(false);
    expect(
      exportSchema.safeParse({ type: "ATTENDANCE", extra: true }).success,
    ).toBe(false);
    expect(exportSchema.safeParse({ type: "NOPE" }).success).toBe(false);
  });
  it("uses private storage download capability for owner", async () => {
    const { service, storage, db } = make();
    db.reporteExportacion.findFirst.mockResolvedValue({
      ...baseJob,
      expiresAt: new Date("2099-02-01"),
    });
    await service.download(actor(), baseJob.id);
    expect(storage.downloadUrl).toHaveBeenCalledWith(
      baseJob.archivoId,
      expect.objectContaining({
        subjectId: "7",
        resourceId: baseJob.archivoId,
        purpose: "download",
      }),
      "7",
    );
  });
});
