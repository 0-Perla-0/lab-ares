import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../src/auth/auth-user";
import {
  EstadoUsuario,
  RolUsuario,
  TipoEventoGamificacion,
} from "../src/generated/prisma/enums";
import {
  gamificationBadgeSchema,
  gamificationIdempotencyKeySchema,
  gamificationRuleSchema,
  manualRecognitionSchema,
  reverseGamificationEventSchema,
} from "../src/gamification/gamification.schemas";
import { GamificationService } from "../src/gamification/gamification.service";

const EVENT_ID = "c12345678901234567890";

const actor = (rol: RolUsuario = RolUsuario.PRESTADOR): AuthUser => ({
  id: rol === RolUsuario.ADMIN ? 1 : 7,
  codigo: rol === RolUsuario.ADMIN ? "ADMIN" : "U7",
  email: rol === RolUsuario.ADMIN ? "admin@test.local" : "u7@test.local",
  rol,
  estado: EstadoUsuario.ACTIVA,
  sedeId: 1,
  areaId: 1,
  turnoId: null,
});

function make(enabled = true, overrides: any = {}) {
  const baseEvent = {
    id: EVENT_ID,
    usuarioId: 7,
    actorId: 1,
    tipo: TipoEventoGamificacion.RECONOCIMIENTO_MANUAL,
    puntos: 50,
    sourceKey: "manual:recognition-0001",
    motivo: "Buen trabajo",
    actividadId: null,
    reglaId: null,
    reversaDeId: null,
    reverso: null,
  };
  const tx: any = {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    usuario: {
      findFirst: vi.fn().mockResolvedValue({ id: 7, codigo: "U7" }),
    },
    eventoGamificacion: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { puntos: 550 },
        _count: { id: 6 },
      }),
      findMany: vi.fn().mockResolvedValue([baseEvent]),
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve({ id: EVENT_ID, ...data }),
        ),
    },
    reglaGamificacion: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: "gamification-rule-kairos-v1",
        codigo: "KAIROS_COMPLETADA",
        version: 1,
        origen: "KAIROS_TERMINADA",
        puntos: 100,
        activa: true,
      }),
      aggregate: vi.fn().mockResolvedValue({ _max: { version: 1 } }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve({ id: "rule-v2", ...data }),
        ),
    },
    insigniaGamificacion: {
      findMany: vi.fn().mockResolvedValue([
        {
          codigo: "PRIMER_PASO",
          nombre: "Primer paso",
          descripcion: "100 puntos",
          umbralPuntos: 100,
          version: 1,
        },
      ]),
      aggregate: vi.fn().mockResolvedValue({ _max: { version: 1 } }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi
        .fn()
        .mockImplementation(({ data }: any) =>
          Promise.resolve({ id: "badge-v2", ...data }),
        ),
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
      key === "GAMIFICATION_ENABLED" ? enabled : 100,
    ),
  };
  return {
    service: new GamificationService(prisma, audit as any, config as any),
    prisma,
    tx,
    audit,
    baseEvent,
  };
}

describe("GamificationService", () => {
  it("keeps the feature disabled by default and makes integration hooks no-ops", async () => {
    const { service, tx } = make(false);
    await expect(service.profile(actor())).rejects.toMatchObject({
      status: 503,
    });
    await expect(
      service.awardKairos(tx, {
        activityId: "a-1",
        userId: 7,
        actorId: 1,
        historyId: "h-1",
      }),
    ).resolves.toBeNull();
    expect(tx.eventoGamificacion.create).not.toHaveBeenCalled();
  });

  it("returns a private derived profile without publishing a ranking", async () => {
    const { service } = make();
    const profile = await service.profile(actor());
    expect(profile).toMatchObject({
      usuario: { id: 7, codigo: "U7" },
      puntos: 550,
      nivel: 6,
      eventos: 6,
      privado: true,
      insignias: [{ codigo: "PRIMER_PASO" }],
    });
    expect(JSON.stringify(profile)).not.toMatch(/ranking|puesto|leaderboard/i);
  });

  it("allows self reads and admin reads but rejects another regular user", async () => {
    const { service } = make();
    await expect(service.profile(actor(), 8)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.profile(actor(RolUsuario.ADMIN), 7),
    ).resolves.toBeDefined();
  });

  it("paginates explicitly selected private history fields", async () => {
    const { service, tx } = make();
    await expect(
      service.history(actor(), 7, { page: 2, pageSize: 10 }),
    ).resolves.toMatchObject({ total: 1, page: 2, pageSize: 10 });
    const query = tx.eventoGamificacion.findMany.mock.calls[0][0];
    expect(query).toMatchObject({ skip: 10, take: 10 });
    expect(JSON.stringify(query.select)).not.toMatch(
      /sourceKey|actorId|usuarioId/,
    );
  });

  it("versions rules and badges instead of mutating historical rows", async () => {
    const { service, tx, audit } = make();
    const admin = actor(RolUsuario.ADMIN);
    const rule = await service.createRuleVersion(admin, {
      codigo: "KAIROS_COMPLETADA",
      origen: "KAIROS_TERMINADA",
      puntos: 120,
      motivo: "Ajuste aprobado",
    });
    const badge = await service.createBadgeVersion(admin, {
      codigo: "EXPERTO",
      nombre: "Experto",
      descripcion: "Acumuló mil puntos",
      umbralPuntos: 1000,
      motivo: "Catálogo inicial",
    });
    expect(rule.version).toBe(2);
    expect(badge.version).toBe(2);
    expect(tx.reglaGamificacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { activa: false } }),
    );
    expect(tx.insigniaGamificacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { activa: false } }),
    );
    expect(audit.append).toHaveBeenCalledTimes(2);
  });

  it("turns concurrent version collisions into a controlled conflict", async () => {
    const { service, prisma } = make();
    prisma.$transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(
      service.createRuleVersion(actor(RolUsuario.ADMIN), {
        codigo: "KAIROS_COMPLETADA",
        origen: "KAIROS_TERMINADA",
        puntos: 100,
        motivo: "Versión concurrente",
      }),
    ).rejects.toMatchObject({ status: 409 });
    prisma.$transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(
      service.createBadgeVersion(actor(RolUsuario.ADMIN), {
        codigo: "EXPERTO",
        nombre: "Experto",
        descripcion: "Umbral",
        umbralPuntos: 1000,
        motivo: "Versión concurrente",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("creates an idempotent manual recognition and rejects key reuse", async () => {
    const input = { usuarioId: 7, puntos: 50, motivo: "Buen trabajo" };
    const { service, tx, audit, baseEvent } = make();
    await expect(
      service.recognize(actor(RolUsuario.ADMIN), input, "recognition-0001"),
    ).resolves.toMatchObject({ puntos: 50, usuarioId: 7 });
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "GAMIFICATION_MANUAL_RECOGNITION_GRANTED",
      }),
      tx,
    );

    tx.eventoGamificacion.findUnique.mockResolvedValueOnce(baseEvent);
    await expect(
      service.recognize(actor(RolUsuario.ADMIN), input, "recognition-0001"),
    ).resolves.toBe(baseEvent);
    tx.eventoGamificacion.findUnique.mockResolvedValueOnce({
      ...baseEvent,
      puntos: 99,
    });
    await expect(
      service.recognize(actor(RolUsuario.ADMIN), input, "recognition-0001"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("reverses a manual event by appending its negative counterpart", async () => {
    const { service, tx, baseEvent } = make();
    tx.eventoGamificacion.findUnique
      .mockResolvedValueOnce(baseEvent)
      .mockResolvedValueOnce(null);
    await service.reverseManual(
      actor(RolUsuario.ADMIN),
      EVENT_ID,
      "Corrección autorizada",
      "reversal-0001",
    );
    expect(tx.eventoGamificacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: TipoEventoGamificacion.REVERSO,
        puntos: -50,
        reversaDeId: EVENT_ID,
      }),
    });
    expect(tx.eventoGamificacion.update).toBeUndefined();
    expect(tx.eventoGamificacion.delete).toBeUndefined();
  });

  it("only treats a completed manual reversal as idempotent for the same key", async () => {
    const { service, tx, baseEvent } = make();
    const reversal = {
      id: "c09876543210987654321",
      sourceKey: "manual-reversal:reversal-0001",
    };
    tx.eventoGamificacion.findUnique.mockResolvedValue({
      ...baseEvent,
      reverso: reversal,
    });
    await expect(
      service.reverseManual(
        actor(RolUsuario.ADMIN),
        EVENT_ID,
        "Corrección autorizada",
        "reversal-0001",
      ),
    ).resolves.toBe(reversal);
    await expect(
      service.reverseManual(
        actor(RolUsuario.ADMIN),
        EVENT_ID,
        "Otro intento",
        "reversal-0002",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("awards an approved Kairos completion once using the active rule", async () => {
    const { service, tx, audit } = make();
    await service.awardKairos(tx, {
      activityId: "a-1",
      userId: 7,
      actorId: 1,
      historyId: "h-1",
    });
    expect(tx.eventoGamificacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuarioId: 7,
        puntos: 100,
        sourceKey: "kairos-completed:h-1",
        tipo: TipoEventoGamificacion.OTORGAMIENTO,
      }),
    });
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "GAMIFICATION_KAIROS_POINTS_GRANTED" }),
      tx,
    );
  });

  it("reopening Kairos appends a reversal and preserves the original grant", async () => {
    const original = {
      id: EVENT_ID,
      usuarioId: 7,
      puntos: 100,
      reglaId: "gamification-rule-kairos-v1",
    };
    const { service, tx } = make(true, {
      tx: {
        eventoGamificacion: { findFirst: vi.fn().mockResolvedValue(original) },
      },
    });
    await service.reverseKairos(tx, {
      activityId: "a-1",
      actorId: 1,
      historyId: "h-2",
      reason: "Reapertura fundada",
    });
    expect(tx.eventoGamificacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        puntos: -100,
        reversaDeId: EVENT_ID,
        sourceKey: "kairos-reopened:h-2",
      }),
    });
  });

  it("validates strict administrative inputs and idempotency keys", () => {
    expect(() =>
      gamificationRuleSchema.parse({
        codigo: "BAD code",
        origen: "KAIROS_TERMINADA",
        puntos: 1,
        motivo: "x",
      }),
    ).toThrow();
    expect(() =>
      gamificationBadgeSchema.parse({
        codigo: "BADGE",
        nombre: "",
        descripcion: "x",
        umbralPuntos: 1,
        motivo: "x",
      }),
    ).toThrow();
    expect(() =>
      manualRecognitionSchema.parse({ usuarioId: 7, puntos: -1, motivo: "x" }),
    ).toThrow();
    expect(() =>
      reverseGamificationEventSchema.parse({ motivo: "", extra: 1 }),
    ).toThrow();
    expect(gamificationIdempotencyKeySchema.safeParse("short").success).toBe(
      false,
    );
    expect(
      gamificationIdempotencyKeySchema.safeParse("valid-key-0001").success,
    ).toBe(true);
  });

  it("enforces append-only signs and one reversal at the database boundary", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260925280000_private_gamification/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("EventoGamificacion_puntos_chk");
    expect(sql).toContain("EventoGamificacion_reversal_sign_chk");
    expect(sql).toContain("EventoGamificacion_reversaDeId_key");
    expect(sql).toMatch(/'REVERSO' AND `puntos` < 0/);
    expect(sql).not.toMatch(
      /UPDATE `EventoGamificacion`|DELETE FROM `EventoGamificacion`/i,
    );
  });
});
