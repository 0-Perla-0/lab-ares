import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { PrismaService } from "../../src/database/prisma.service";
import type { AuthUser } from "../../src/auth/auth-user";
import { AuditService } from "../../src/auth/audit.service";
import { AbsenceTransaction } from "../../src/absences/absence-transaction";
import { AbsencesRepository } from "../../src/absences/absences.repository";
import { AbsencesService } from "../../src/absences/absences.service";
import { CalendarService } from "../../src/calendar/calendar.service";
import type { StorageService } from "../../src/storage/storage.service";

config({ path: [".env", "../.env"], quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/_(test|ci)$/.test(new URL(databaseUrl).pathname))
  throw new Error(
    "Absence integration requires a dedicated DATABASE_URL ending in _test or _ci",
  );
const prisma = new PrismaService(
  new ConfigService({ DATABASE_URL: databaseUrl }),
);
const writes = new AbsenceTransaction(prisma);
const audit = new AuditService(prisma);
const repository = new AbsencesRepository(prisma);
const calendar = new CalendarService(prisma, writes, audit);
const service = new AbsencesService(
  prisma,
  repository,
  writes,
  calendar,
  audit,
  {} as StorageService,
);
const prefix = `absence-${randomUUID().slice(0, 8)}`;
let sedeId: number, areaId: number, turnoId: number;
let owner: AuthUser,
  coordinator: AuthUser,
  authority: AuthUser,
  admin: AuthUser;
let absenceId: string;
const userIds: number[] = [];
async function clear() {
  if (!userIds.length) return;
  await prisma.justificacionAusencia.deleteMany({
    where: { ausencia: { userId: { in: userIds } } },
  });
  await prisma.apelacionAusencia.deleteMany({
    where: { ausencia: { userId: { in: userIds } } },
  });
  await prisma.ausencia.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.excepcionCalendario.deleteMany({
    where: { creadoPorId: { in: userIds } },
  });
  await prisma.calendarPreview.deleteMany({
    where: { actorId: { in: userIds } },
  });
  await prisma.absenceOperation.deleteMany({
    where: { actorId: { in: userIds } },
  });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
}
describe("absences/calendar on real MariaDB", () => {
  beforeAll(async () => {
    sedeId = (await prisma.sede.create({ data: { nombre: prefix } })).id;
    areaId = (await prisma.area.create({ data: { nombre: prefix, sedeId } }))
      .id;
    turnoId = (
      await prisma.turno.create({
        data: {
          nombre: "Diurno",
          areaId,
          horaInicio: new Date("1970-01-01T08:00:00Z"),
          horaFin: new Date("1970-01-01T12:00:00Z"),
          dias: { create: [{ dia: "JUEVES" }] },
        },
      })
    ).id;
    const actors: AuthUser[] = [];
    for (const rol of [
      "PRESTADOR",
      "COORDINADOR",
      "JEFE_AREA",
      "ADMIN",
    ] as const) {
      const row = await prisma.usuario.create({
        data: {
          codigo: `${prefix}-${rol}`,
          email: `${prefix}-${rol}@example.test`,
          passwordHash: "non-login-synthetic-fixture",
          rol,
          estado: "ACTIVA",
          sedeId,
          areaId,
          turnoId,
        },
      });
      userIds.push(row.id);
      actors.push(row);
    }
    [owner, coordinator, authority, admin] = actors;
  });
  beforeEach(async () => {
    await clear();
    absenceId = (
      await prisma.ausencia.create({
        data: {
          userId: owner.id,
          sedeId,
          areaId,
          turnoId,
          fecha: new Date("2026-10-08"),
          plazoLimiteAt: new Date("2099-10-20T05:59:59Z"),
        },
      })
    ).id;
  });
  afterAll(async () => {
    await clear();
    await prisma.usuario.deleteMany({ where: { id: { in: userIds } } });
    if (turnoId) await prisma.turno.delete({ where: { id: turnoId } });
    if (areaId) await prisma.area.delete({ where: { id: areaId } });
    if (sedeId) await prisma.sede.delete({ where: { id: sedeId } });
    await prisma.$disconnect();
  });
  it("concurrent same-key requests insert exactly one private submission", async () => {
    const input = { version: 1, motivo: "Justificación sintética" };
    const [a, b] = await Promise.all([
      service.justify(owner, "same-request-key", absenceId, input),
      service.justify(owner, "same-request-key", absenceId, input),
    ]);
    expect(a).toEqual(b);
    expect(
      await prisma.justificacionAusencia.count({
        where: { ausenciaId: absenceId },
      }),
    ).toBe(1);
    expect(
      await prisma.ausencia.findUnique({ where: { id: absenceId } }),
    ).toMatchObject({ estado: "JUSTIFICACION_ENVIADA", version: 2 });
    const events = await prisma.auditEvent.findMany({
      where: { objectId: absenceId, action: "ABSENCE_JUSTIFICATION_SUBMITTED" },
    });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(input.motivo);
  });
  it("an audit failure really rolls back the submission, state, notification and replay key", async () => {
    const failing = {
      append: async () => {
        throw new Error("synthetic audit failure");
      },
    } as unknown as AuditService;
    const testService = new AbsencesService(
      prisma,
      repository,
      writes,
      calendar,
      failing,
      {} as StorageService,
    );
    await expect(
      testService.justify(owner, "rollback-request-key", absenceId, {
        version: 1,
        motivo: "Justificación sintética",
      }),
    ).rejects.toThrow("synthetic audit failure");
    expect(
      await prisma.justificacionAusencia.count({
        where: { ausenciaId: absenceId },
      }),
    ).toBe(0);
    expect(
      await prisma.ausencia.findUnique({ where: { id: absenceId } }),
    ).toMatchObject({ estado: "PENDIENTE_JUSTIFICACION", version: 1 });
    expect(
      await prisma.notification.count({ where: { userId: owner.id } }),
    ).toBe(0);
    expect(
      await prisma.absenceOperation.count({ where: { actorId: owner.id } }),
    ).toBe(0);
  });
  it("concurrent reviewers cannot resolve the same version twice", async () => {
    await service.justify(owner, "submit-request-key", absenceId, {
      version: 1,
      motivo: "Justificación sintética",
    });
    const input = {
      version: 2,
      decision: "JUSTIFICADA" as const,
      motivo: "Acreditada con documentación",
    };
    const results = await Promise.allSettled([
      service.resolve(coordinator, "review-request-key", absenceId, input),
      service.resolve(authority, "other-review-key", absenceId, input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.auditEvent.count({
        where: { objectId: absenceId, action: "ABSENCE_RESOLVED" },
      }),
    ).toBe(1);
  });
  it("completes appeal only with an independent authority and does not permit a second ordinary appeal", async () => {
    await service.justify(owner, "submit-request-key", absenceId, {
      version: 1,
      motivo: "Justificación sintética",
    });
    await service.resolve(authority, "reject-request-key", absenceId, {
      version: 2,
      decision: "NO_JUSTIFICADA",
      motivo: "Rechazo inicial sintético",
    });
    await service.appeal(owner, "appeal-request-key", absenceId, {
      version: 3,
      argumento: "Apelación ordinaria sintética",
    });
    await expect(
      service.resolveAppeal(authority, "self-appeal-review-key", absenceId, {
        version: 4,
        decision: "JUSTIFICADA",
        motivo: "Decisión sintética",
      }),
    ).rejects.toMatchObject({ code: "ABSENCE_INDEPENDENT_REVIEW_REQUIRED" });
    await service.resolveAppeal(admin, "final-appeal-review-key", absenceId, {
      version: 4,
      decision: "NO_JUSTIFICADA",
      motivo: "Resolución definitiva sintética",
    });
    await expect(
      service.appeal(owner, "second-appeal-key", absenceId, {
        version: 5,
        argumento: "Otra apelación ordinaria",
      }),
    ).rejects.toMatchObject({ code: "ABSENCE_STATE_INVALID" });
  });
  it("retrospective suspension cancels only after exact preview and revocation does not resurrect absence", async () => {
    const input = {
      titulo: "Suspensión sintética",
      motivo: "Cierre institucional sintético",
      tipo: "SUSPENSION_OPERATIVA" as const,
      efecto: "SUSPENSION_ACTIVIDADES" as const,
      alcance: "AREA" as const,
      areaId,
      fechaInicio: "2026-10-08",
      fechaFin: "2026-10-08",
    };
    const preview: any = await calendar.preview(
      coordinator,
      "preview-request-key",
      input,
    );
    const exception: any = await calendar.create(
      coordinator,
      "create-request-key",
      input,
      preview.previewId,
    );
    expect(
      await prisma.ausencia.findUnique({ where: { id: absenceId } }),
    ).toMatchObject({ estado: "CANCELADA" });
    expect(
      await calendar.isWorkDay(owner.id, new Date("2026-10-08T18:00:00Z")),
    ).toMatchObject({ isWorkDay: false });
    const revoked: any = await calendar.revokePreview(
      coordinator,
      "revoke-preview-key",
      exception.id,
    );
    await calendar.revoke(
      coordinator,
      "revoke-request-key",
      exception.id,
      "Reapertura institucional",
      revoked.previewId,
    );
    expect(
      await calendar.isWorkDay(owner.id, new Date("2026-10-08T18:00:00Z")),
    ).toMatchObject({ isWorkDay: true });
    expect(
      await prisma.ausencia.findUnique({ where: { id: absenceId } }),
    ).toMatchObject({ estado: "CANCELADA" });
  });
  it("audit failure rolls back calendar insertion and absence cancellation together", async () => {
    const input = {
      titulo: "Suspensión sintética",
      motivo: "Cierre institucional sintético",
      tipo: "SUSPENSION_OPERATIVA" as const,
      efecto: "SUSPENSION_ACTIVIDADES" as const,
      alcance: "AREA" as const,
      areaId,
      fechaInicio: "2026-10-08",
      fechaFin: "2026-10-08",
    };
    const preview: any = await calendar.preview(
      coordinator,
      "preview-request-key",
      input,
    );
    const failing = {
      append: async () => {
        throw new Error("synthetic calendar audit failure");
      },
    } as unknown as AuditService;
    const testCalendar = new CalendarService(prisma, writes, failing);
    await expect(
      testCalendar.create(
        coordinator,
        "rollback-calendar-key",
        input,
        preview.previewId,
      ),
    ).rejects.toThrow("synthetic calendar audit failure");
    expect(
      await prisma.excepcionCalendario.count({
        where: { creadoPorId: coordinator.id },
      }),
    ).toBe(0);
    expect(
      await prisma.ausencia.findUnique({ where: { id: absenceId } }),
    ).toMatchObject({ estado: "PENDIENTE_JUSTIFICACION", version: 1 });
  });
});
