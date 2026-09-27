import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccionFinalRetencion,
  CategoriaRetencion,
  EstadoElementoSupresion,
  EstadoLoteSupresion,
  EstadoRegistroRetencion,
  EstadoReglaRetencion,
  EstadoRetencionLegal,
  EstadoSolicitudSupresion,
  EstadoUsuario,
  RolUsuario,
  TipoOperacionRetencion,
} from "../src/generated/prisma/enums";
import { RetentionService } from "../src/retention/retention.service";
import {
  legalHoldCreateSchema,
  retentionIdempotencyKeySchema,
  retentionRuleCreateSchema,
  suppressionBatchCreateSchema,
  suppressionRequestResolveSchema,
} from "../src/retention/retention.schemas";

const actor = {
  id: 7,
  codigo: "admin",
  email: "admin@ares.test",
  rol: RolUsuario.ADMIN,
  estado: EstadoUsuario.ACTIVA,
  sedeId: null,
  areaId: null,
  turnoId: null,
};
const cuid = "c123456789012345678901";
const rule = {
  id: "rule-1",
  categoria: CategoriaRetencion.EXPORTACIONES,
  version: 3,
  periodoActivoDias: 10,
  periodoBloqueadoDias: 20,
  accionFinal: AccionFinalRetencion.ELIMINAR,
  provisional: true,
  automatica: false,
  estado: EstadoReglaRetencion.APROBADA,
};
const mock = () => vi.fn(async (..._args: any[]) => null as any);

function setup() {
  const prisma: any = {
    $transaction: mock(),
    $executeRaw: mock(),
  };
  const names = [
    "reglaRetencion",
    "registroRetencion",
    "retencionLegal",
    "solicitudSupresion",
    "loteSupresion",
    "elementoLoteSupresion",
    "registroSupresion",
    "operacionRetencion",
    "reporteExportacion",
    "archivo",
    "session",
    "recoveryToken",
    "mfaChallenge",
    "notification",
  ];
  for (const name of names) {
    prisma[name] = Object.fromEntries(
      [
        "findUnique",
        "findFirst",
        "findMany",
        "create",
        "update",
        "updateMany",
        "upsert",
        "aggregate",
        "count",
        "deleteMany",
      ].map((method) => [method, mock()]),
    );
  }
  prisma.$transaction.mockImplementation(async (arg: any) =>
    typeof arg === "function" ? arg(prisma) : Promise.all(arg),
  );
  const audit = { append: mock() };
  const notifications = { create: mock() };
  const config = {
    get: vi.fn((key: string) => {
      if (key === "RETENTION_INSTITUTIONAL_POLICIES_APPROVED") return false;
      if (key === "RETENTION_MAX_ATTEMPTS") return 3;
      if (key === "RETENTION_LEASE_MS") return 120000;
      if (key === "RETENTION_RETRY_BASE_MS") return 60000;
      return 20;
    }),
  };
  const storage = { removeGenerated: mock() };
  const objectStorage = { delete: mock() };
  return {
    service: new RetentionService(
      prisma,
      audit as any,
      notifications as any,
      config as any,
      storage as any,
      objectStorage as any,
    ),
    prisma,
    audit,
    notifications,
    config,
    storage,
    objectStorage,
  };
}

function operationMock(prisma: any) {
  prisma.operacionRetencion.findUnique.mockResolvedValue(null);
  prisma.operacionRetencion.create.mockResolvedValue({ id: "op-1" });
  prisma.operacionRetencion.update.mockResolvedValue({});
}

describe("RetentionService", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
    operationMock(ctx.prisma);
  });

  it("creates successive rule versions and requires institutional approval for approval", async () => {
    ctx.prisma.reglaRetencion.aggregate.mockResolvedValue({
      _max: { version: 2 },
    });
    ctx.prisma.reglaRetencion.create.mockResolvedValue({ ...rule, version: 3 });
    const input = {
      categoria: CategoriaRetencion.EXPORTACIONES,
      finalidad: "Conservar exportaciones por necesidad institucional",
      responsable: "Administración",
      eventoInicio: "Generación de reporte",
      periodoActivoDias: 10,
      periodoBloqueadoDias: 20,
      accionFinal: AccionFinalRetencion.ELIMINAR,
      fundamento: "Política de conservación institucional aplicable",
      provisional: true,
      automatica: false,
    };
    await ctx.service.createRule(actor as any, input, "rule-version-0001");
    expect(ctx.prisma.reglaRetencion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 3 }),
      }),
    );

    ctx.prisma.operacionRetencion.findUnique.mockResolvedValueOnce(null);
    ctx.prisma.reglaRetencion.findUnique.mockResolvedValue({
      ...rule,
      provisional: false,
      estado: EstadoReglaRetencion.BORRADOR,
    });
    await expect(
      ctx.service.approveRule(
        actor as any,
        cuid,
        "Acta aprobada 2026",
        "rule-approve-0001",
      ),
    ).rejects.toMatchObject({
      code: "RETENTION_INSTITUTIONAL_APPROVAL_REQUIRED",
    });
  });

  it("rejects unsafe provisional rules and only allows documented provisional adapters", async () => {
    const bad = {
      categoria: CategoriaRetencion.EXPEDIENTE,
      finalidad: "Conservar expediente por cumplimiento institucional",
      responsable: "Administración",
      eventoInicio: "Cierre de expediente",
      periodoActivoDias: 10,
      periodoBloqueadoDias: 20,
      accionFinal: AccionFinalRetencion.ELIMINAR,
      fundamento: "La regla requiere validación institucional formal",
      provisional: true,
      automatica: false,
    };
    await expect(
      ctx.service.createRule(actor as any, bad, "bad-provisional-0001"),
    ).rejects.toMatchObject({ code: "RETENTION_PROVISIONAL_POLICY_INVALID" });
    const adapter = (ctx.service as any).executeAdapter.bind(ctx.service);
    await expect(
      adapter({
        categoria: CategoriaRetencion.EXPEDIENTE,
        resourceType: "Expediente",
        regla: rule,
      }),
    ).rejects.toMatchObject({ code: "RETENTION_ADAPTER_UNAVAILABLE" });
  });

  it("registers a record using a rule snapshot to calculate immutable due dates", async () => {
    const triggeredAt = new Date("2026-01-01T00:00:00.000Z");
    ctx.prisma.registroRetencion.findUnique.mockResolvedValue(null);
    ctx.prisma.reglaRetencion.findFirst.mockResolvedValue(rule);
    ctx.prisma.reporteExportacion.findUnique.mockResolvedValue({
      id: "report-1",
    });
    ctx.prisma.registroRetencion.create.mockImplementation(
      async ({ data }: any) => ({ ...data, id: cuid }),
    );
    await ctx.service.registerRecord(
      actor as any,
      {
        categoria: CategoriaRetencion.EXPORTACIONES,
        resourceType: "ReporteExportacion",
        resourceId: "report-1",
        triggeredAt,
      },
      "record-create-0001",
    );
    expect(ctx.prisma.registroRetencion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reglaId: rule.id,
          archiveDueAt: new Date("2026-01-11T00:00:00.000Z"),
          actionDueAt: new Date("2026-01-31T00:00:00.000Z"),
        }),
      }),
    );
    expect(ctx.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ policyVersion: rule.version }),
      }),
      ctx.prisma,
    );
  });

  it("advances eligible records from active to archived-blocked exactly once", async () => {
    ctx.prisma.registroRetencion.findMany.mockResolvedValue([
      { id: cuid, subjectId: 3, categoria: CategoriaRetencion.LOGS },
    ]);
    ctx.prisma.registroRetencion.updateMany.mockResolvedValue({ count: 1 });
    expect(await ctx.service.advanceLifecycle()).toBe(1);
    expect(ctx.prisma.registroRetencion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estado: EstadoRegistroRetencion.ACTIVO,
        }),
        data: expect.objectContaining({
          estado: EstadoRegistroRetencion.BLOQUEADO_ARCHIVADO,
        }),
      }),
    );
    expect(ctx.audit.append).toHaveBeenCalledOnce();
  });

  it("creates and releases legal holds with the supplied actor and explanation", async () => {
    ctx.prisma.registroRetencion.findUnique.mockResolvedValue({
      id: cuid,
      estado: EstadoRegistroRetencion.BLOQUEADO_ARCHIVADO,
      subjectId: 2,
    });
    ctx.prisma.retencionLegal.findFirst.mockResolvedValue(null);
    const reviewAt = new Date(Date.now() + 86_400_000);
    ctx.prisma.retencionLegal.create.mockResolvedValue({
      id: "hold-1",
      estado: EstadoRetencionLegal.ACTIVA,
      reviewAt,
      responsable: "Legal",
    });
    await ctx.service.createLegalHold(
      actor as any,
      {
        registroId: cuid,
        motivo: "Investigación institucional en curso",
        responsable: "Legal",
        reviewAt,
      },
      "hold-create-0001",
    );
    expect(ctx.prisma.retencionLegal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ creadoPorId: actor.id }),
      }),
    );

    ctx.prisma.operacionRetencion.findUnique.mockResolvedValueOnce(null);
    ctx.prisma.retencionLegal.findUnique.mockResolvedValue({
      id: "hold-1",
      estado: EstadoRetencionLegal.ACTIVA,
      registroId: cuid,
      registro: { subjectId: 2 },
    });
    await ctx.service.releaseLegalHold(
      actor as any,
      "c123456789012345678902",
      "Investigación concluida satisfactoriamente",
      "hold-release-0001",
    );
    expect(ctx.prisma.retencionLegal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoRetencionLegal.LIBERADA,
          motivoLiberacion: "Investigación concluida satisfactoriamente",
        }),
      }),
    );
  });

  it("filters active legal holds out of suppression batch previews", async () => {
    ctx.prisma.registroRetencion.findMany.mockResolvedValue([]);
    await expect(
      ctx.service.createBatch(
        actor as any,
        { cutoffAt: new Date(), limit: 10 },
        "batch-preview-0001",
      ),
    ).rejects.toMatchObject({ code: "SUPPRESSION_BATCH_EMPTY" });
    expect(ctx.prisma.registroRetencion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          retencionesLegales: { none: { estado: EstadoRetencionLegal.ACTIVA } },
        }),
      }),
    );
  });

  it("keeps deletion requests pending, without directly deleting records, and notifies on resolution", async () => {
    const requester = { ...actor, rol: RolUsuario.PRESTADOR };
    ctx.prisma.solicitudSupresion.findFirst.mockResolvedValue(null);
    ctx.prisma.solicitudSupresion.create.mockResolvedValue({
      id: "request-1",
      estado: EstadoSolicitudSupresion.ABIERTA,
    });
    await ctx.service.createRequest(
      requester as any,
      "Solicito revisión de mis datos personales",
      "request-create-0001",
    );
    expect(ctx.prisma.solicitudSupresion.create).toHaveBeenCalled();
    expect(ctx.prisma.registroRetencion.update).not.toHaveBeenCalled();
    expect(ctx.prisma.session.deleteMany).not.toHaveBeenCalled();

    ctx.prisma.operacionRetencion.findUnique.mockResolvedValueOnce(null);
    ctx.prisma.solicitudSupresion.findUnique.mockResolvedValue({
      id: "request-1",
      solicitanteId: requester.id,
      estado: EstadoSolicitudSupresion.ABIERTA,
    });
    ctx.prisma.solicitudSupresion.update.mockResolvedValue({
      id: "request-1",
      estado: EstadoSolicitudSupresion.APROBADA,
    });
    await ctx.service.resolveRequest(
      actor as any,
      "c123456789012345678903",
      {
        decision: "APPROVE",
        resolucion: "Solicitud aprobada para revisión operativa",
        clasificacion: [],
      },
      "request-resolve-0001",
    );
    expect(ctx.notifications.create).toHaveBeenCalledWith(
      requester.id,
      "SUPPRESSION_REQUEST_RESOLVED",
      expect.objectContaining({ estado: EstadoSolicitudSupresion.APROBADA }),
      ctx.prisma,
    );
  });

  it("previews, authorizes and pauses a batch through audited state changes", async () => {
    const actionDueAt = new Date(Date.now() - 60_000);
    const cutoffAt = new Date();
    ctx.prisma.registroRetencion.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: cuid }])
      .mockResolvedValueOnce([{ id: cuid }])
      .mockResolvedValueOnce([
        {
          id: cuid,
          estado: EstadoRegistroRetencion.BLOQUEADO_ARCHIVADO,
          actionDueAt,
          regla: rule,
        },
      ]);
    ctx.prisma.registroRetencion.updateMany.mockResolvedValue({ count: 1 });
    ctx.prisma.loteSupresion.create.mockResolvedValue({
      id: "batch-1",
      totalElementos: 1,
    });
    await ctx.service.createBatch(
      actor as any,
      { cutoffAt, limit: 10 },
      "batch-preview-0001",
    );
    ctx.prisma.operacionRetencion.findUnique.mockResolvedValueOnce(null);
    ctx.prisma.loteSupresion.findUnique.mockResolvedValue({
      id: "c123456789012345678904",
      estado: EstadoLoteSupresion.BORRADOR,
      totalElementos: 1,
      cutoffAt,
      elementos: [{ registroId: cuid, registro: { regla: rule } }],
    });
    ctx.prisma.loteSupresion.update.mockResolvedValue({
      id: "batch-1",
      estado: EstadoLoteSupresion.AUTORIZADO,
    });
    await ctx.service.authorizeBatch(
      actor as any,
      "c123456789012345678904",
      "batch-authorize-0001",
    );
    expect(ctx.prisma.registroRetencion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoRegistroRetencion.SUPRESION_PROGRAMADA,
        }),
      }),
    );

    ctx.prisma.operacionRetencion.findUnique.mockResolvedValueOnce(null);
    ctx.prisma.loteSupresion.findUnique.mockResolvedValue({
      id: "batch-1",
      estado: EstadoLoteSupresion.AUTORIZADO,
    });
    await ctx.service.pauseBatch(
      actor as any,
      "c123456789012345678904",
      "Pausa para revisión legal",
      "batch-pause-0001",
    );
    expect(ctx.prisma.loteSupresion.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: EstadoLoteSupresion.PAUSADO }),
      }),
    );
  });

  it("claims pending batch items, honors holds, fingerprints without storing the resource id, and is repeat-safe", async () => {
    const batch = {
      id: "batch-1",
      estado: EstadoLoteSupresion.AUTORIZADO,
      autorizadoPorId: actor.id,
      cutoffAt: new Date(),
      elementos: [],
    };
    ctx.prisma.loteSupresion.findUnique.mockResolvedValue(batch);
    ctx.prisma.registroRetencion.findUnique.mockResolvedValue({
      id: cuid,
      estado: EstadoRegistroRetencion.SUPRESION_PROGRAMADA,
      actionDueAt: new Date(Date.now() - 60_000),
      subjectId: 4,
      regla: rule,
    });
    ctx.prisma.elementoLoteSupresion.updateMany.mockResolvedValue({ count: 1 });
    ctx.prisma.registroRetencion.updateMany.mockResolvedValue({ count: 1 });
    ctx.prisma.retencionLegal.findFirst.mockResolvedValue({ id: "hold-1" });
    ctx.prisma.elementoLoteSupresion.findMany.mockResolvedValue([
      { estado: EstadoElementoSupresion.OMITIDO_RETENCION_LEGAL },
    ]);
    ctx.prisma.loteSupresion.update.mockResolvedValue(batch);
    await (ctx.service as any).processItem(batch, {
      id: "item-1",
      registroId: cuid,
      registro: { subjectId: 4 },
    });
    expect(ctx.prisma.elementoLoteSupresion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estado: EstadoElementoSupresion.PENDIENTE,
        }),
        data: expect.objectContaining({
          estado: EstadoElementoSupresion.OMITIDO_RETENCION_LEGAL,
        }),
      }),
    );
    expect(ctx.prisma.registroRetencion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoRegistroRetencion.BLOQUEADO_ARCHIVADO,
          scheduledAt: null,
        }),
      }),
    );

    ctx.prisma.retencionLegal.findFirst.mockResolvedValue(null);
    const item = {
      id: "item-2",
      registroId: cuid,
      registro: {
        id: cuid,
        categoria: CategoriaRetencion.EXPORTACIONES,
        resourceType: "ReporteExportacion",
        resourceId: "secret-resource-id",
        subjectId: 4,
        regla: rule,
      },
    };
    ctx.prisma.reporteExportacion.findUnique.mockResolvedValue({
      archivoId: "file-1",
    });
    await (ctx.service as any).executeAdapter(item.registro);
    expect(ctx.storage.removeGenerated).toHaveBeenCalledWith("file-1");
    ctx.prisma.registroSupresion.upsert.mockImplementation(
      async ({ create }: any) => {
        expect(create.resourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(create).not.toHaveProperty("resourceId");
        return {};
      },
    );

    ctx.prisma.elementoLoteSupresion.updateMany.mockResolvedValue({ count: 0 });
    await (ctx.service as any).processItem(batch, item);
    expect(ctx.prisma.registroSupresion.upsert).not.toHaveBeenCalled();
  });

  it("recovers expired processing leases and schedules transient failures for retry", async () => {
    const batch = {
      id: "batch-1",
      estado: EstadoLoteSupresion.AUTORIZADO,
      autorizadoPorId: actor.id,
      cutoffAt: new Date(),
    };
    ctx.prisma.loteSupresion.findUnique.mockResolvedValue(batch);
    ctx.prisma.elementoLoteSupresion.updateMany.mockResolvedValue({ count: 1 });
    ctx.prisma.retencionLegal.findFirst.mockResolvedValue(null);
    const item = {
      id: "item-retry",
      registroId: cuid,
      registro: {
        id: cuid,
        categoria: CategoriaRetencion.EXPORTACIONES,
        resourceType: "ReporteExportacion",
        resourceId: "report-2",
        subjectId: 2,
        regla: rule,
      },
    };
    ctx.prisma.registroRetencion.findUnique.mockResolvedValue({
      ...item.registro,
      estado: EstadoRegistroRetencion.SUPRESION_PROGRAMADA,
      actionDueAt: new Date(Date.now() - 60_000),
    });
    ctx.prisma.reporteExportacion.findUnique.mockRejectedValue(
      new Error("temporary storage outage"),
    );
    await (ctx.service as any).processItem(batch, item);
    expect(
      ctx.prisma.elementoLoteSupresion.updateMany,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estado: EstadoElementoSupresion.PROCESANDO,
          leaseOwner: expect.any(String),
        }),
        data: expect.objectContaining({
          estado: EstadoElementoSupresion.PENDIENTE,
          nextAttemptAt: expect.any(Date),
          leaseOwner: null,
          leaseUntil: null,
        }),
      }),
    );
  });

  it("reclaims expired leases and marks an item failed after its configured attempts are exhausted", async () => {
    const batch = {
      id: "batch-lease",
      estado: EstadoLoteSupresion.AUTORIZADO,
      autorizadoPorId: actor.id,
      cutoffAt: new Date(),
      elementos: [],
    };
    ctx.prisma.loteSupresion.findUnique.mockResolvedValue(batch);
    ctx.prisma.elementoLoteSupresion.findMany.mockResolvedValue([
      { estado: EstadoElementoSupresion.PENDIENTE },
    ]);
    ctx.prisma.loteSupresion.update.mockResolvedValue(batch);
    await ctx.service.processBatch("batch-lease");
    expect(ctx.prisma.elementoLoteSupresion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estado: EstadoElementoSupresion.PROCESANDO,
          attempts: { gte: 3 },
          leaseUntil: { lte: expect.any(Date) },
        }),
        data: expect.objectContaining({
          estado: EstadoElementoSupresion.FALLIDO,
          errorCode: "SUPPRESSION_ITEM_LEASE_EXPIRED",
        }),
      }),
    );
    expect(ctx.prisma.elementoLoteSupresion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estado: EstadoElementoSupresion.PROCESANDO,
          leaseUntil: { lte: expect.any(Date) },
        }),
        data: expect.objectContaining({
          estado: EstadoElementoSupresion.PENDIENTE,
          leaseOwner: null,
          leaseUntil: null,
        }),
      }),
    );

    ctx.prisma.elementoLoteSupresion.updateMany.mockReset();
    ctx.prisma.elementoLoteSupresion.updateMany.mockResolvedValue({ count: 1 });
    ctx.config.get.mockImplementation((key: string) => {
      if (key === "RETENTION_MAX_ATTEMPTS") return 3;
      if (key === "RETENTION_LEASE_MS") return 120000;
      if (key === "RETENTION_RETRY_BASE_MS") return 60000;
      return 20;
    });
    ctx.prisma.retencionLegal.findFirst.mockResolvedValue(null);
    ctx.prisma.reporteExportacion.findUnique.mockRejectedValue(
      new Error("permanent storage outage"),
    );
    ctx.prisma.registroRetencion.findUnique.mockResolvedValue({
      id: cuid,
      categoria: CategoriaRetencion.EXPORTACIONES,
      resourceType: "ReporteExportacion",
      resourceId: "report-3",
      estado: EstadoRegistroRetencion.SUPRESION_PROGRAMADA,
      actionDueAt: new Date(Date.now() - 60_000),
      regla: rule,
    });
    await (ctx.service as any).processItem(batch, {
      id: "item-exhausted",
      attempts: 2,
      registroId: cuid,
      registro: {
        id: cuid,
        categoria: CategoriaRetencion.EXPORTACIONES,
        resourceType: "ReporteExportacion",
        resourceId: "report-3",
        regla: rule,
      },
    });
    expect(
      ctx.prisma.elementoLoteSupresion.updateMany,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoElementoSupresion.FALLIDO,
          processedAt: expect.any(Date),
          nextAttemptAt: null,
          leaseOwner: null,
          leaseUntil: null,
        }),
      }),
    );
  });

  it("rejects future cutoffs both at the schema and service boundaries", async () => {
    const future = new Date(Date.now() + 60_000);
    expect(
      suppressionBatchCreateSchema.safeParse({ cutoffAt: future, limit: 10 })
        .success,
    ).toBe(false);
    await expect(
      ctx.service.createBatch(
        actor as any,
        { cutoffAt: future, limit: 10 },
        "future-cutoff-0001",
      ),
    ).rejects.toMatchObject({ code: "SUPPRESSION_CUTOFF_IN_FUTURE" });
    expect(ctx.prisma.registroRetencion.findMany).not.toHaveBeenCalled();
  });

  it("serializes legal holds against records already being suppressed", async () => {
    ctx.prisma.registroRetencion.findUnique.mockResolvedValue({
      id: cuid,
      estado: EstadoRegistroRetencion.SUPRESION_PROGRAMADA,
      subjectId: 2,
    });
    ctx.prisma.elementoLoteSupresion.findFirst.mockResolvedValue({
      id: "processing-item",
    });
    await expect(
      ctx.service.createLegalHold(
        actor as any,
        {
          registroId: cuid,
          motivo: "Investigación institucional todavía en curso",
          responsable: "Jurídico",
          reviewAt: new Date(Date.now() + 86_400_000),
        },
        "hold-processing-0001",
      ),
    ).rejects.toMatchObject({ code: "RETENTION_SUPPRESSION_IN_PROGRESS" });
    expect(ctx.prisma.retencionLegal.create).not.toHaveBeenCalled();
  });

  it("executes records whose approved policy snapshot was later superseded", async () => {
    ctx.prisma.session.deleteMany.mockResolvedValue({ count: 1 });
    await (ctx.service as any).executeAdapter({
      categoria: CategoriaRetencion.SESIONES_TOKENS,
      resourceType: "Session",
      resourceId: "session-1",
      regla: {
        ...rule,
        estado: EstadoReglaRetencion.SUSTITUIDA,
        approvedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    expect(ctx.prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { id: "session-1" },
    });
  });

  it("does not mark a rejected file suppressed when object storage deletion fails", async () => {
    const batch = {
      id: "batch-file",
      estado: EstadoLoteSupresion.AUTORIZADO,
      autorizadoPorId: actor.id,
      cutoffAt: new Date(),
    };
    const record = {
      id: cuid,
      categoria: CategoriaRetencion.ARCHIVOS_RECHAZADOS,
      resourceType: "Archivo",
      resourceId: "file-1",
      estado: EstadoRegistroRetencion.SUPRESION_PROGRAMADA,
      actionDueAt: new Date(Date.now() - 60_000),
      regla: { ...rule, accionFinal: AccionFinalRetencion.ANONIMIZAR },
    };
    ctx.prisma.loteSupresion.findUnique.mockResolvedValue(batch);
    ctx.prisma.registroRetencion.findUnique.mockResolvedValue(record);
    ctx.prisma.retencionLegal.findFirst.mockResolvedValue(null);
    ctx.prisma.elementoLoteSupresion.updateMany.mockResolvedValue({ count: 1 });
    ctx.prisma.archivo.findFirst.mockResolvedValue({
      objectKey: "available/file-1",
      quarantineKey: "quarantine/file-1",
    });
    ctx.objectStorage.delete.mockRejectedValueOnce(new Error("S3 unavailable"));

    await (ctx.service as any).processItem(batch, {
      id: "item-file",
      attempts: 0,
      registroId: cuid,
    });

    expect(ctx.prisma.archivo.updateMany).not.toHaveBeenCalled();
    expect(ctx.prisma.registroSupresion.upsert).not.toHaveBeenCalled();
    expect(
      ctx.prisma.elementoLoteSupresion.updateMany,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoElementoSupresion.PENDIENTE,
          errorCode: "Error",
        }),
      }),
    );
  });

  it("rejects authorization when a preview became stale", async () => {
    const cutoffAt = new Date();
    ctx.prisma.loteSupresion.findUnique.mockResolvedValue({
      id: cuid,
      estado: EstadoLoteSupresion.BORRADOR,
      cutoffAt,
      totalElementos: 1,
      elementos: [{ registroId: "c123456789012345678905" }],
    });
    ctx.prisma.registroRetencion.findMany.mockResolvedValue([]);
    await expect(
      ctx.service.authorizeBatch(actor as any, cuid, "stale-batch-0001"),
    ).rejects.toMatchObject({ code: "SUPPRESSION_BATCH_STALE" });
    expect(ctx.prisma.loteSupresion.update).not.toHaveBeenCalled();
  });

  it("renews the item lease while a long side effect is still running", async () => {
    vi.useFakeTimers();
    try {
      ctx.prisma.elementoLoteSupresion.updateMany.mockResolvedValue({
        count: 1,
      });
      let finish!: () => void;
      const work = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const running = (ctx.service as any).withLeaseHeartbeat(
        "item-long",
        "worker-long",
        () => work,
      );
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(40_000);
      expect(
        ctx.prisma.elementoLoteSupresion.updateMany.mock.calls.length,
      ).toBeGreaterThanOrEqual(2);
      finish();
      await running;
      expect(
        ctx.prisma.elementoLoteSupresion.updateMany,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            estado: EstadoElementoSupresion.PROCESANDO,
            leaseOwner: "worker-long",
          }),
          data: { leaseUntil: expect.any(Date) },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("explicitly resumes paused or failed batches and resets failed items", async () => {
    ctx.prisma.loteSupresion.findUnique.mockResolvedValue({
      id: cuid,
      estado: EstadoLoteSupresion.FALLIDO,
    });
    ctx.prisma.elementoLoteSupresion.updateMany.mockResolvedValue({ count: 2 });
    ctx.prisma.loteSupresion.update.mockResolvedValue({
      id: cuid,
      estado: EstadoLoteSupresion.AUTORIZADO,
    });
    const process = vi.spyOn(ctx.service, "processBatch").mockResolvedValue({
      id: cuid,
      estado: EstadoLoteSupresion.EN_EJECUCION,
    } as any);

    const response = await ctx.service.retryBatch(
      actor as any,
      cuid,
      "retry-batch-0001",
    );

    expect(response).toEqual({ id: cuid, accepted: true, resetFailures: 2 });
    expect(ctx.prisma.elementoLoteSupresion.updateMany).toHaveBeenCalledWith({
      where: { loteId: cuid, estado: EstadoElementoSupresion.FALLIDO },
      data: expect.objectContaining({
        estado: EstadoElementoSupresion.PENDIENTE,
        attempts: 0,
        errorCode: null,
        processedAt: null,
      }),
    });
    expect(ctx.prisma.loteSupresion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoLoteSupresion.AUTORIZADO,
          fallidos: 0,
          finishedAt: null,
        }),
      }),
    );
    expect(process).toHaveBeenCalledWith(cuid);
  });

  it("returns and audits a safe reapplication report and replays it idempotently", async () => {
    const logRule = { ...rule, categoria: CategoriaRetencion.LOGS };
    ctx.prisma.registroSupresion.findMany.mockResolvedValue([
      {
        id: "registry-ok",
        registro: {
          categoria: CategoriaRetencion.SESIONES_TOKENS,
          resourceType: "Session",
          resourceId: "session-1",
          regla: rule,
        },
      },
      {
        id: "registry-failed",
        registro: {
          categoria: CategoriaRetencion.LOGS,
          resourceType: "TechnicalLog",
          resourceId: "log-1",
          regla: logRule,
        },
      },
    ]);
    ctx.prisma.session.deleteMany.mockResolvedValue({ count: 1 });
    ctx.prisma.registroSupresion.update.mockResolvedValue({});

    const report = await ctx.service.reapplySuppressed(
      actor as any,
      2,
      "reapply-report-0001",
    );

    expect(report).toEqual({
      accepted: true,
      limit: 2,
      total: 2,
      reapplied: 1,
      failed: 1,
      failures: [
        {
          registryId: "registry-failed",
          errorCode: "RETENTION_ADAPTER_UNAVAILABLE",
        },
      ],
    });
    expect(ctx.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SUPPRESSION_REAPPLICATION_COMPLETED",
        metadata: report,
      }),
      ctx.prisma,
    );

    const requestHash = (ctx.service as any).fingerprint(
      TipoOperacionRetencion.REAPLICAR_SUPRESIONES,
      { limit: 2 },
    );
    ctx.prisma.operacionRetencion.create.mockRejectedValueOnce({
      code: "P2002",
    });
    ctx.prisma.operacionRetencion.findUnique.mockResolvedValueOnce({
      tipo: TipoOperacionRetencion.REAPLICAR_SUPRESIONES,
      requestHash,
      response: report,
    });
    const replay = await ctx.service.reapplySuppressed(
      actor as any,
      2,
      "reapply-report-0001",
    );
    expect(replay).toEqual(report);
    expect(ctx.prisma.registroSupresion.findMany).toHaveBeenCalledOnce();
  });

  it("reapplies registry adapters and enforces idempotency keys against changed requests", async () => {
    ctx.prisma.operacionRetencion.findUnique.mockResolvedValue({
      tipo: "CREAR_SOLICITUD",
      requestHash: "different",
      response: { ok: true },
    });
    await expect(
      ctx.service.createRequest(
        { ...actor, rol: RolUsuario.PRESTADOR } as any,
        "Otro motivo válido para revisar",
        "same-key-reused-0001",
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

    ctx.prisma.operacionRetencion.findUnique.mockResolvedValueOnce(null);
    ctx.prisma.operacionRetencion.create.mockResolvedValueOnce({ id: "op-2" });
    ctx.prisma.registroSupresion.findMany.mockResolvedValue([]);
    const response = await ctx.service.reapplySuppressed(
      actor as any,
      5,
      "reapply-key-0001",
    );
    expect(response).toMatchObject({ accepted: true, limit: 5, reapplied: 0 });
    expect(ctx.prisma.registroSupresion.findMany).toHaveBeenCalled();
  });
});

describe("retention schemas and migration contract", () => {
  it("rejects unknown schema fields, malformed ids, and reversed legal-hold dates", () => {
    expect(
      retentionRuleCreateSchema.safeParse({
        categoria: CategoriaRetencion.LOGS,
        extra: true,
      }).success,
    ).toBe(false);
    expect(retentionIdempotencyKeySchema.safeParse("short").success).toBe(
      false,
    );
    expect(
      legalHoldCreateSchema.safeParse({
        registroId: cuid,
        motivo: "Motivo suficientemente largo",
        responsable: "Legal",
        reviewAt: "2026-06-01",
        endsAt: "2026-05-01",
      }).success,
    ).toBe(false);
    expect(
      suppressionBatchCreateSchema.safeParse({
        cutoffAt: "2026-01-01",
        extra: 1,
      }).success,
    ).toBe(false);
    expect(
      suppressionRequestResolveSchema.safeParse({
        decision: "APPROVE",
        resolucion: "Resolución suficientemente extensa",
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("declares retention lifecycle states and database checks in the Prisma schema and migration", () => {
    const root = join(__dirname, "..");
    const prismaSchema = readFileSync(
      join(root, "prisma/schema.prisma"),
      "utf8",
    );
    const migration = readFileSync(
      join(
        root,
        "prisma/migrations/20260925300000_retention_suppression/migration.sql",
      ),
      "utf8",
    );
    expect(prismaSchema).toContain("enum EstadoRegistroRetencion");
    expect(prismaSchema).toContain("BLOQUEADO_ARCHIVADO");
    expect(prismaSchema).toContain("PROCESANDO");
    expect(migration).toContain("RegistroRetencion_dates_chk");
    expect(migration).toContain("RetencionLegal_release_chk");
    expect(migration).toContain("ElementoLoteSupresion_processed_chk");
    expect(migration).toContain("ElementoLoteSupresion_lease_chk");
    expect(migration).toContain("ElementoLoteSupresion_attempts_chk");
  });
});
