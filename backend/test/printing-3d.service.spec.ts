import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../src/auth/auth-user";
import {
  EstadoArchivo,
  EstadoTrabajoImpresion3D,
  EstadoUsuario,
  ResultadoEjecucionImpresion3D,
  RolUsuario,
  TipoOperacionImpresion3D,
} from "../src/generated/prisma/enums";
import {
  printing3dExecutionFinishSchema,
  printing3dIdempotencyKeySchema,
  printing3dJobCreateSchema,
  printing3dReviewSchema,
} from "../src/printing-3d/printing-3d.schemas";
import { Printing3dService } from "../src/printing-3d/printing-3d.service";

const JOB_ID = "c12345678901234567890";
const EXECUTION_ID = "c09876543210987654321";
const FILE_ID = "c11111111111111111111";

const actor = (
  rol: RolUsuario = RolUsuario.PRESTADOR,
  id = rol === RolUsuario.PRESTADOR ? 7 : 1,
): AuthUser => ({
  id,
  codigo: `U${id}`,
  email: `u${id}@test.local`,
  rol,
  estado: EstadoUsuario.ACTIVA,
  sedeId: 1,
  areaId: 10,
  turnoId: null,
});

const job = (
  estado: EstadoTrabajoImpresion3D = EstadoTrabajoImpresion3D.SOLICITADO,
  overrides: any = {},
) => ({
  id: JOB_ID,
  solicitanteId: 7,
  archivoId: FILE_ID,
  descripcion: "Modelo de prueba",
  estado,
  sedeId: 1,
  areaId: 10,
  operadorAsignadoId: null,
  revisadoPorId: null,
  motivoRevision: null,
  reviewedAt: null,
  assignedAt: null,
  canceladoPorId: null,
  motivoCancelacion: null,
  cancelledAt: null,
  solicitante: { id: 7, codigo: "U7" },
  operadorAsignado: null,
  revisadoPor: null,
  archivo: {
    id: FILE_ID,
    originalName: "model.stl",
    detectedMime: "model/stl",
    status: EstadoArchivo.DISPONIBLE,
  },
  ejecuciones: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const execution = (overrides: any = {}) => ({
  id: EXECUTION_ID,
  trabajoId: JOB_ID,
  operadorId: 1,
  numero: 1,
  startedAt: new Date(),
  finishedAt: null,
  material: "PLA",
  pesoGramos: null,
  resultado: null,
  observacion: null,
  operador: { id: 1, codigo: "U1" },
  ...overrides,
});

function make(enabled = true, overrides: any = {}) {
  const tx: any = {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    operacionImpresion3D: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "op-1" }),
      update: vi.fn().mockResolvedValue({ id: "op-1" }),
    },
    archivo: {
      findUnique: vi.fn().mockResolvedValue({
        id: FILE_ID,
        propietarioId: 7,
        status: EstadoArchivo.DISPONIBLE,
        detectedMime: "model/stl",
      }),
    },
    trabajoImpresion3D: {
      create: vi.fn().mockResolvedValue(job()),
      update: vi.fn().mockImplementation(({ data }: any) =>
        Promise.resolve(
          job(data.estado ?? EstadoTrabajoImpresion3D.SOLICITADO, {
            operadorAsignadoId: data.operadorAsignadoId ?? null,
            ...data,
          }),
        ),
      ),
      findUnique: vi.fn().mockResolvedValue(job()),
      findMany: vi.fn().mockResolvedValue([job()]),
      count: vi.fn().mockResolvedValue(1),
    },
    ejecucionImpresion3D: {
      aggregate: vi.fn().mockResolvedValue({ _max: { numero: 0 } }),
      create: vi.fn().mockResolvedValue(execution()),
      update: vi
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve(execution(data)),
        ),
      findUnique: vi.fn().mockResolvedValue(execution()),
      findFirst: vi.fn().mockResolvedValue(execution()),
    },
    usuario: {
      findFirst: vi.fn().mockResolvedValue(actor(RolUsuario.COORDINADOR)),
    },
  };
  const merge = (base: any, extra: any): any =>
    Object.fromEntries(
      Object.keys({ ...base, ...extra }).map((key) => [
        key,
        base[key] &&
        extra?.[key] &&
        typeof base[key] === "object" &&
        typeof extra[key] === "object"
          ? merge(base[key], extra[key])
          : (extra?.[key] ?? base[key]),
      ]),
    );
  Object.assign(tx, merge(tx, overrides.tx ?? {}));
  const prisma: any = {
    ...tx,
    $transaction: vi.fn((value: any) =>
      Array.isArray(value) ? Promise.all(value) : value(tx),
    ),
  };
  const audit = { append: vi.fn().mockResolvedValue(undefined) };
  const config = {
    get: vi.fn((key: string) =>
      key === "PRINTING_3D_ENABLED" ? enabled : undefined,
    ),
  };
  const storage = {
    downloadUrl: vi.fn().mockResolvedValue("https://private-download"),
  };
  const notifications = { create: vi.fn().mockResolvedValue({ id: "n-1" }) };
  return {
    service: new Printing3dService(
      prisma,
      audit as any,
      config as any,
      storage as any,
      notifications as any,
    ),
    prisma,
    tx,
    audit,
    storage,
    notifications,
  };
}

describe("Printing3dService", () => {
  it("is disabled by default at the service boundary", async () => {
    const { service } = make(false);
    await expect(service.detail(actor(), JOB_ID)).rejects.toMatchObject({
      status: 503,
    });
  });

  it("creates an idempotent job only from the requester's available STL", async () => {
    const { service, tx, audit } = make();
    await expect(
      service.create(
        actor(),
        { archivoId: FILE_ID, descripcion: "Modelo estructural" },
        "printing-create-0001",
      ),
    ).resolves.toMatchObject({ estado: EstadoTrabajoImpresion3D.SOLICITADO });
    expect(tx.archivo.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: FILE_ID } }),
    );
    expect(tx.trabajoImpresion3D.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          solicitanteId: 7,
          archivoId: FILE_ID,
          sedeId: 1,
          areaId: 10,
        }),
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PRINTING_3D_JOB_CREATED" }),
      tx,
    );
  });

  it("rejects a foreign, unscanned or non-STL file", async () => {
    const { service } = make(true, {
      tx: {
        archivo: {
          findUnique: vi.fn().mockResolvedValue({
            id: FILE_ID,
            propietarioId: 99,
            status: EstadoArchivo.DISPONIBLE,
            detectedMime: "application/pdf",
          }),
        },
      },
    });
    await expect(
      service.create(
        actor(),
        { archivoId: FILE_ID, descripcion: "Modelo" },
        "printing-create-0002",
      ),
    ).rejects.toMatchObject({ code: "PRINTING_3D_STL_NOT_AVAILABLE" });
  });

  it("limits regular listings to own/assigned jobs and managers to their area", async () => {
    const own = make();
    await own.service.list(actor(), { page: 1, pageSize: 20 });
    expect(own.tx.trabajoImpresion3D.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ solicitanteId: 7 }, { operadorAsignadoId: 7 }],
    });

    const manager = make();
    await manager.service.list(actor(RolUsuario.COORDINADOR), {
      page: 1,
      pageSize: 20,
    });
    expect(
      manager.tx.trabajoImpresion3D.findMany.mock.calls[0][0].where,
    ).toEqual({
      OR: [{ solicitanteId: 1 }, { operadorAsignadoId: 1 }, { areaId: 10 }],
    });
  });

  it("hides a job from an unrelated requester", async () => {
    const { service } = make(true, {
      tx: {
        trabajoImpresion3D: {
          findUnique: vi
            .fn()
            .mockResolvedValue(job(undefined, { solicitanteId: 99 })),
        },
      },
    });
    await expect(service.detail(actor(), JOB_ID)).rejects.toMatchObject({
      code: "PRINTING_3D_JOB_NOT_FOUND",
    });
  });

  it("moves review through EN_REVISION and an explicit approval", async () => {
    const started = make();
    await started.service.review(
      actor(RolUsuario.COORDINADOR),
      JOB_ID,
      { decision: "START" },
      "printing-review-0001",
    );
    expect(started.tx.trabajoImpresion3D.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoTrabajoImpresion3D.EN_REVISION,
          reviewedAt: null,
        }),
      }),
    );

    const approved = make(true, {
      tx: {
        trabajoImpresion3D: {
          findUnique: vi
            .fn()
            .mockResolvedValue(job(EstadoTrabajoImpresion3D.EN_REVISION)),
        },
      },
    });
    await approved.service.review(
      actor(RolUsuario.COORDINADOR),
      JOB_ID,
      { decision: "APPROVE", motivo: "Viable" },
      "printing-review-0002",
    );
    expect(approved.tx.trabajoImpresion3D.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoTrabajoImpresion3D.APROBADO,
          revisadoPorId: 1,
        }),
      }),
    );
    expect(approved.notifications.create).toHaveBeenCalled();
  });

  it("assigns only an active in-scope operator and enters the queue", async () => {
    const { service, tx, notifications } = make(true, {
      tx: {
        trabajoImpresion3D: {
          findUnique: vi
            .fn()
            .mockResolvedValue(job(EstadoTrabajoImpresion3D.APROBADO)),
        },
      },
    });
    await service.assign(
      actor(RolUsuario.COORDINADOR),
      JOB_ID,
      { operadorId: 1 },
      "printing-assign-0001",
    );
    expect(tx.trabajoImpresion3D.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoTrabajoImpresion3D.EN_COLA,
          operadorAsignadoId: 1,
        }),
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      1,
      "PRINTING_3D_OPERATOR_ASSIGNED",
      { jobId: JOB_ID },
      tx,
    );
  });

  it("starts a numbered execution only for the assigned operator", async () => {
    const { service, tx } = make(true, {
      tx: {
        trabajoImpresion3D: {
          findUnique: vi.fn().mockResolvedValue(
            job(EstadoTrabajoImpresion3D.EN_COLA, {
              operadorAsignadoId: 1,
            }),
          ),
        },
      },
    });
    await service.startExecution(
      actor(RolUsuario.COORDINADOR),
      JOB_ID,
      { material: "PLA" },
      "printing-start-0001",
    );
    expect(tx.ejecucionImpresion3D.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ numero: 1, material: "PLA" }),
      }),
    );
    expect(tx.trabajoImpresion3D.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { estado: EstadoTrabajoImpresion3D.EN_IMPRESION },
      }),
    );
  });

  it("finishes an execution and derives the terminal job state", async () => {
    const { service, tx, notifications } = make(true, {
      tx: {
        trabajoImpresion3D: {
          findUnique: vi.fn().mockResolvedValue(
            job(EstadoTrabajoImpresion3D.EN_IMPRESION, {
              operadorAsignadoId: 1,
            }),
          ),
        },
      },
    });
    await service.finishExecution(
      actor(RolUsuario.COORDINADOR),
      JOB_ID,
      EXECUTION_ID,
      { resultado: "COMPLETADA", pesoGramos: 42 },
      "printing-finish-0001",
    );
    expect(tx.ejecucionImpresion3D.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultado: ResultadoEjecucionImpresion3D.COMPLETADA,
          pesoGramos: 42,
        }),
      }),
    );
    expect(tx.trabajoImpresion3D.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { estado: EstadoTrabajoImpresion3D.COMPLETADO },
      }),
    );
    expect(notifications.create).toHaveBeenCalled();
  });

  it("requeues a failed job without rewriting its prior execution", async () => {
    const { service, tx } = make(true, {
      tx: {
        trabajoImpresion3D: {
          findUnique: vi.fn().mockResolvedValue(
            job(EstadoTrabajoImpresion3D.FALLIDO, {
              operadorAsignadoId: 1,
            }),
          ),
        },
      },
    });
    await service.retry(
      actor(RolUsuario.COORDINADOR),
      JOB_ID,
      "Nuevo intento autorizado",
      "printing-retry-0001",
    );
    expect(tx.trabajoImpresion3D.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { estado: EstadoTrabajoImpresion3D.EN_COLA },
      }),
    );
    expect(tx.ejecucionImpresion3D.update).not.toHaveBeenCalled();
  });

  it("lets a requester cancel before printing but not an active print", async () => {
    const pending = make();
    await pending.service.cancel(
      actor(),
      JOB_ID,
      "Ya no se requiere",
      "printing-cancel-0001",
    );
    expect(pending.tx.trabajoImpresion3D.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: EstadoTrabajoImpresion3D.CANCELADO,
          canceladoPorId: 7,
        }),
      }),
    );

    const active = make(true, {
      tx: {
        trabajoImpresion3D: {
          findUnique: vi.fn().mockResolvedValue(
            job(EstadoTrabajoImpresion3D.EN_IMPRESION, {
              operadorAsignadoId: 1,
            }),
          ),
        },
      },
    });
    await expect(
      active.service.cancel(
        actor(),
        JOB_ID,
        "Cancelar",
        "printing-cancel-0002",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("records operator cancellation of an active execution", async () => {
    const { service, tx } = make(true, {
      tx: {
        trabajoImpresion3D: {
          findUnique: vi.fn().mockResolvedValue(
            job(EstadoTrabajoImpresion3D.EN_IMPRESION, {
              operadorAsignadoId: 1,
            }),
          ),
        },
      },
    });
    await service.cancel(
      actor(RolUsuario.COORDINADOR),
      JOB_ID,
      "Falla mecánica",
      "printing-cancel-0003",
    );
    expect(tx.ejecucionImpresion3D.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultado: ResultadoEjecucionImpresion3D.CANCELADA,
          observacion: "Falla mecánica",
        }),
      }),
    );
  });

  it("replays an idempotent operation and rejects the same key with another payload", async () => {
    const { service, tx } = make();
    const input = { archivoId: FILE_ID, descripcion: "Modelo" };
    await service.create(actor(), input, "printing-create-replay");
    const operationData = tx.operacionImpresion3D.create.mock.calls[0][0].data;
    tx.operacionImpresion3D.findUnique.mockResolvedValue({
      id: "op-1",
      ...operationData,
      trabajoId: JOB_ID,
      ejecucionId: null,
    });
    await expect(
      service.create(actor(), input, "printing-create-replay"),
    ).resolves.toMatchObject({ id: JOB_ID });
    expect(tx.trabajoImpresion3D.create).toHaveBeenCalledTimes(1);
    await expect(
      service.create(
        actor(),
        { ...input, descripcion: "Otro modelo" },
        "printing-create-replay",
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("revalidates current scope before returning an idempotent replay", async () => {
    const { service, tx } = make();
    const manager = actor(RolUsuario.COORDINADOR);
    const input = { decision: "START" as const };
    await service.review(manager, JOB_ID, input, "printing-review-replay");
    const operationData = tx.operacionImpresion3D.create.mock.calls[0][0].data;
    tx.operacionImpresion3D.findUnique.mockResolvedValue({
      id: "op-1",
      ...operationData,
      trabajoId: JOB_ID,
      ejecucionId: null,
    });
    tx.trabajoImpresion3D.findUnique.mockResolvedValue(
      job(EstadoTrabajoImpresion3D.EN_REVISION),
    );

    await expect(
      service.review(
        { ...manager, areaId: 99 },
        JOB_ID,
        input,
        "printing-review-replay",
      ),
    ).rejects.toMatchObject({ code: "PRINTING_3D_JOB_NOT_FOUND" });
  });

  it("authorizes a short-lived private STL download only after scoped access", async () => {
    const { service, storage, audit } = make();
    await expect(service.download(actor(), JOB_ID)).resolves.toBe(
      "https://private-download",
    );
    expect(storage.downloadUrl).toHaveBeenCalledWith(
      FILE_ID,
      expect.objectContaining({
        subjectId: "7",
        resourceId: FILE_ID,
        purpose: "download",
      }),
      "7",
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PRINTING_3D_STL_DOWNLOAD_REQUESTED" }),
      expect.anything(),
    );
  });

  it("validates strict requests, required failure reasons and idempotency keys", () => {
    expect(() =>
      printing3dJobCreateSchema.parse({
        archivoId: FILE_ID,
        descripcion: "Modelo",
        extra: true,
      }),
    ).toThrow();
    expect(() =>
      printing3dReviewSchema.parse({ decision: "REJECT" }),
    ).toThrow();
    expect(() =>
      printing3dExecutionFinishSchema.parse({ resultado: "FALLIDA" }),
    ).toThrow();
    expect(printing3dIdempotencyKeySchema.safeParse("short").success).toBe(
      false,
    );
    expect(
      printing3dIdempotencyKeySchema.safeParse("printing-valid-0001").success,
    ).toBe(true);
  });

  it("persists the complete state machine, execution integrity and idempotency boundary", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260925290000_printing_3d/migration.sql",
      ),
      "utf8",
    );
    for (const state of [
      "SOLICITADO",
      "EN_REVISION",
      "APROBADO",
      "EN_COLA",
      "EN_IMPRESION",
      "COMPLETADO",
      "RECHAZADO",
      "CANCELADO",
      "FALLIDO",
    ])
      expect(sql).toContain(`'${state}'`);
    expect(sql).toContain("EjecucionImpresion3D_finish_chk");
    expect(sql).toContain("OperacionImpresion3D_actorId_key_key");
    expect(TipoOperacionImpresion3D.REENCOLAR).toBe("REENCOLAR");
  });
});
