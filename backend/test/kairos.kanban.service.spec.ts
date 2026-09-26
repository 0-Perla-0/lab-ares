import { describe, expect, it, vi } from "vitest";
import { EstadoActividadKairos, EstadoProyectoKairos, EstadoUsuario } from "../src/generated/prisma/enums";
import { KairosKanbanService } from "../src/kairos/kanban.service";
import { kanbanQuerySchema } from "../src/kairos/kanban.schemas";

const actor = { id: 7, estado: EstadoUsuario.ACTIVA } as any;
const states = [
  EstadoActividadKairos.PENDIENTE,
  EstadoActividadKairos.EN_PROGRESO,
  EstadoActividadKairos.BLOQUEADA,
  EstadoActividadKairos.EN_REVISION,
  EstadoActividadKairos.REQUIERE_CORRECCION,
  EstadoActividadKairos.TERMINADA,
  EstadoActividadKairos.CANCELADA,
];

const card = (state: EstadoActividadKairos, patch: any = {}) => ({
  id: `a-${state}`,
  title: "Actividad pública",
  state,
  priority: "ALTA",
  complexity: "MEDIA",
  startAt: null,
  dueAt: null,
  closedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  responsable: { id: 3, codigo: "USR-3" },
  _count: { participants: 2 },
  ...patch,
});

function make(overrides: any = {}) {
  const executeRaw = vi.fn().mockResolvedValue([]);
  const project = { id: "c12345678901234567890", estado: EstadoProyectoKairos.ACTIVO };
  const tx: any = {
    $executeRaw: executeRaw,
    proyectoKairos: { findUnique: vi.fn().mockResolvedValue(project), ...overrides.proyectoKairos },
    miembroProyectoKairos: { findFirst: vi.fn().mockResolvedValue({ usuarioId: actor.id }), ...overrides.miembroProyectoKairos },
    actividadKairos: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockImplementation(({ where }: any) => Promise.resolve([card(where.state)])),
      ...overrides.actividadKairos,
    },
  };
  const prisma: any = {
    $transaction: vi.fn((fn: any) => fn(tx)),
    ...overrides.prisma,
  };
  return { service: new KairosKanbanService(prisma), prisma, tx, executeRaw };
}

describe("Kairos Kanban projection", () => {
  it("returns all seven canonical lanes in order, including empty lanes", async () => {
    const { service, tx } = make({ actividadKairos: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    } });
    const result = await service.get(actor, "c12345678901234567890", { limitPerLane: 50 });
    expect(result.lanes.map((lane: any) => lane.state)).toEqual(states);
    expect(result.lanes).toHaveLength(7);
    expect(tx.actividadKairos.findMany).toHaveBeenCalledTimes(7);
  });

  it("projects cards directly and performs no writes", async () => {
    const { service, tx } = make({ actividadKairos: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockImplementation(({ where }: any) => Promise.resolve([card(where.state)])),
    } });
    const result = await service.get(actor, "c12345678901234567890", { limitPerLane: 1 });
    expect(result.lanes[0].items[0]).toEqual(expect.objectContaining({
      id: expect.any(String), title: "Actividad pública", participantCount: 2, responsable: { id: 3, codigo: "USR-3" },
    }));
    expect(result.lanes[0].items[0]).not.toHaveProperty("description");
    expect(tx.actividadKairos).not.toHaveProperty("create");
    expect(tx.actividadKairos).not.toHaveProperty("update");
    expect(tx.actividadKairos).not.toHaveProperty("delete");
  });

  it("locks project and active actor membership in the same transaction", async () => {
    const { service, prisma, executeRaw } = make();
    await service.get(actor, "c12345678901234567890", { limitPerLane: 1 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(executeRaw.mock.invocationCallOrder[1]);
  });

  it("allows archived projects to be read", async () => {
    const { service } = make({ proyectoKairos: {
      findUnique: vi.fn().mockResolvedValue({ id: "c12345678901234567890", estado: EstadoProyectoKairos.ARCHIVADO }),
    } });
    await expect(service.get(actor, "c12345678901234567890", { limitPerLane: 1 })).resolves.toMatchObject({ projectId: "c12345678901234567890" });
  });

  it("rejects wrong or invalid project identifiers before opening a transaction", async () => {
    const { service, prisma } = make();
    await expect(service.get(actor, "not-a-project", { limitPerLane: 1 })).rejects.toMatchObject({ code: "KAIROS_PROJECT_NOT_FOUND" });
    await expect(service.get({ ...actor, estado: EstadoUsuario.SUSPENDIDA }, "c12345678901234567890", { limitPerLane: 1 })).rejects.toMatchObject({ code: "KAIROS_PROJECT_NOT_FOUND" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("passes every supported filter into each lane query", async () => {
    const { service, tx } = make();
    await service.get(actor, "c12345678901234567890", {
      responsableId: 3, participantId: 8, priority: "CRITICA", complexity: "ALTA", vencida: true, limitPerLane: 9,
    });
    for (const call of tx.actividadKairos.findMany.mock.calls) {
      expect(call[0]).toMatchObject({ take: 9, where: {
        proyectoId: "c12345678901234567890", responsableId: 3, priority: "CRITICA", complexity: "ALTA",
        participants: { some: { usuarioId: 8 } }, dueAt: { lt: expect.any(Date) },
      } });
      expect(call[0].where.state).toBeDefined();
    }
  });

  it("uses the non-overdue predicate for vencida=false", async () => {
    const { service, tx } = make();
    await service.get(actor, "c12345678901234567890", { vencida: false, limitPerLane: 2 });
    expect(tx.actividadKairos.findMany.mock.calls[0][0].where.OR).toEqual(expect.arrayContaining([
      { dueAt: null }, { dueAt: { gte: expect.any(Date) } },
      { state: { in: [EstadoActividadKairos.TERMINADA, EstadoActividadKairos.CANCELADA] } },
    ]));
  });

  it("derives vencida with the same parity as activity listing", async () => {
    const expired = new Date(Date.now() - 60_000);
    const { service } = make({ actividadKairos: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockImplementation(({ where }: any) => Promise.resolve([
        card(where.state, { dueAt: expired, state: where.state }),
      ])),
    } });
    const result = await service.get(actor, "c12345678901234567890", { limitPerLane: 1 });
    const byState = new Map(result.lanes.map((lane: any) => [lane.state, lane.items[0].vencida]));
    expect(byState.get(EstadoActividadKairos.PENDIENTE)).toBe(true);
    expect(byState.get(EstadoActividadKairos.TERMINADA)).toBe(false);
    expect(byState.get(EstadoActividadKairos.CANCELADA)).toBe(false);
  });

  it("caps each lane and orders deterministically by dueAt, createdAt and id", async () => {
    const { service, tx } = make();
    await service.get(actor, "c12345678901234567890", { limitPerLane: 100 });
    for (const call of tx.actividadKairos.findMany.mock.calls) {
      expect(call[0].take).toBe(100);
      expect(call[0].orderBy).toEqual([{ dueAt: "asc" }, { createdAt: "asc" }, { id: "asc" }]);
    }
  });

  it("does not query participants individually (participant relation is a where filter)", async () => {
    const { service, tx } = make();
    await service.get(actor, "c12345678901234567890", { participantId: 9, limitPerLane: 3 });
    expect(tx.actividadKairos.findMany.mock.calls[0][0].where.participants).toEqual({ some: { usuarioId: 9 } });
    expect(tx).not.toHaveProperty("participanteActividadKairos");
  });
});

describe("Kairos Kanban query contract", () => {
  it("defaults limitPerLane and keeps it within 1..100", () => {
    expect(kanbanQuerySchema.parse({}).limitPerLane).toBe(50);
    expect(kanbanQuerySchema.parse({ limitPerLane: "100" }).limitPerLane).toBe(100);
    expect(() => kanbanQuerySchema.parse({ limitPerLane: 101 })).toThrow();
    expect(() => kanbanQuerySchema.parse({ limitPerLane: 0 })).toThrow();
  });

  it("accepts strict booleans and rejects unknown or malformed filters", () => {
    expect(kanbanQuerySchema.parse({ vencida: "true", responsableId: "3", participantId: "4", priority: "ALTA", complexity: "BAJA" })).toMatchObject({ vencida: true, responsableId: 3, participantId: 4 });
    expect(() => kanbanQuerySchema.parse({ vencida: "yes" })).toThrow();
    expect(() => kanbanQuerySchema.parse({ priority: "URGENTE" })).toThrow();
    expect(() => kanbanQuerySchema.parse({ extra: "nope" })).toThrow();
  });
});
