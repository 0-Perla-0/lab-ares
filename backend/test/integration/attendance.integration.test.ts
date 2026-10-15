import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { config } from "dotenv";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AuthUser } from "../../src/auth/auth-user";
import { AttendancePolicy } from "../../src/attendance/attendance.policy";
import { AttendanceService } from "../../src/attendance/attendance.service";
import { PrismaService } from "../../src/database/prisma.service";
import { AuditService } from "../../src/auth/audit.service";
import { AttendanceReviewService } from "../../src/attendance/attendance-review.service";

config({ path: [".env", "../.env"], quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/_(test|ci)$/.test(new URL(databaseUrl).pathname)) {
  throw new Error(
    "Attendance integration requires a dedicated DATABASE_URL ending in _test or _ci",
  );
}
const prisma = new PrismaService(
  new ConfigService({ DATABASE_URL: databaseUrl }),
);
const service = new AttendanceService(
  prisma,
  new AttendancePolicy(),
  new ConfigService({ ATTENDANCE_ALERT_HOURS: 12 }),
  new AuditService(prisma),
);
const prefix = `attendance-${randomUUID().slice(0, 8)}`;
let owner: AuthUser;
let colleague: AuthUser;
let manager: AuthUser;
let otherManager: AuthUser;
let validator: AuthUser;
const userIds: number[] = [];
const sedeIds: number[] = [];
const areaIds: number[] = [];
const turnoIds: number[] = [];

async function clearAttendance() {
  if (userIds.length === 0) return;
  await prisma.asistenciaValidacion.deleteMany({
    where: { attendance: { userId: { in: userIds } } },
  });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.asistenciaEvento.deleteMany({
    where: { attendance: { userId: { in: userIds } } },
  });
  await prisma.asistenciaSolicitud.deleteMany({
    where: { actorId: { in: userIds } },
  });
  await prisma.asistencia.deleteMany({ where: { userId: { in: userIds } } });
}

describe("Attendance on real MariaDB", () => {
  beforeAll(async () => {
    for (let index = 0; index < 2; index++) {
      const sede = await prisma.sede.create({
        data: { nombre: `${prefix}-${index}` },
      });
      sedeIds.push(sede.id);
      const area = await prisma.area.create({
        data: { nombre: "Testing", sedeId: sede.id },
      });
      areaIds.push(area.id);
      const turno = await prisma.turno.create({
        data: {
          nombre: "Diurno",
          areaId: area.id,
          horaInicio: new Date("1970-01-01T08:00:00Z"),
          horaFin: new Date("1970-01-01T18:00:00Z"),
          dias: { create: [{ dia: "LUNES" }] },
        },
      });
      turnoIds.push(turno.id);
      for (const role of ["PRESTADOR", "COORDINADOR", "JEFE_AREA"] as const) {
        const user = await prisma.usuario.create({
          data: {
            codigo: `${prefix}-${index}-${role}`,
            email: `${prefix}-${index}-${role}@example.test`,
            passwordHash: "not-a-login-fixture",
            estado: "ACTIVA",
            rol: role,
            sedeId: sede.id,
            areaId: area.id,
            turnoId: turno.id,
          },
        });
        userIds.push(user.id);
        if (index === 0 && role === "PRESTADOR") owner = user;
        if (index === 0 && role === "COORDINADOR") manager = user;
        if (index === 1 && role === "PRESTADOR") colleague = user;
        if (index === 1 && role === "COORDINADOR") otherManager = user;
        if (index === 0 && role === "JEFE_AREA") validator = user;
      }
    }
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-22T20:00:00Z"));
    await clearAttendance();
  });
  afterAll(async () => {
    vi.useRealTimers();
    await clearAttendance();
    await prisma.usuario.deleteMany({ where: { id: { in: userIds } } });
    await prisma.turno.deleteMany({ where: { id: { in: turnoIds } } });
    await prisma.area.deleteMany({ where: { id: { in: areaIds } } });
    await prisma.sede.deleteMany({ where: { id: { in: sedeIds } } });
    await prisma.$disconnect();
  });

  it("serializes concurrent starts and enforces exactly one open interval", async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 6 }, () => service.checkIn(owner, randomUUID())),
    );
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await prisma.asistencia.count({ where: { userId: owner.id } })).toBe(
      1,
    );
    expect(
      await prisma.asistenciaEvento.count({ where: { actorId: owner.id } }),
    ).toBe(1);
  });

  it("replays concurrent identical requests and rejects changed payload under the same key", async () => {
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.checkIn(owner, key)),
    );
    for (const result of results) expect(result).toEqual(results[0]);
    const current = (await service.mine(owner, { limit: 20 })).open!;
    await expect(
      service.checkOut(owner, key, current.id),
    ).rejects.toMatchObject({ status: 409 });
    await service.checkOut(owner, randomUUID(), current.id);
    // A late retry of the original start never creates another interval.
    expect(await service.checkIn(owner, key)).toEqual(results[0]);
    expect((await service.mine(owner, { limit: 20 })).open).toBeNull();
  });

  it("records same-day time without approving hours and preserves checkout on replay", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-09-22T15:30:00Z"));
      await service.checkIn(owner, randomUUID());
      const current = (await service.mine(owner, { limit: 20 })).open!;
      vi.setSystemTime(new Date("2026-09-22T17:00:15Z"));
      const key = randomUUID();
      const closed = await service.checkOut(owner, key, current.id);
      expect(closed).toMatchObject({
        durationSeconds: 5415,
        status: "PENDIENTE",
      });
      vi.setSystemTime(new Date("2026-09-22T18:00:00Z"));
      expect(await service.checkOut(owner, key, current.id)).toEqual(closed);
      expect((await service.mine(owner, { limit: 20 })).bank).toEqual({
        pendingSeconds: 5415,
        authorizedSeconds: 0,
        rejectedSeconds: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates reads and manual close by scope and audits the successful close", async () => {
    await service.checkIn(owner, randomUUID());
    await service.checkIn(colleague, randomUUID());
    const current = (await service.mine(owner, { limit: 20 })).open!;
    expect(
      (await service.open(manager, { limit: 20 })).items.map(
        (item) => item.userId,
      ),
    ).toEqual([owner.id]);
    await expect(
      service.close(otherManager, randomUUID(), current.id, "Fuera de ámbito"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.checkOut(colleague, randomUUID(), current.id),
    ).rejects.toMatchObject({ status: 403 });
    const key = randomUUID();
    const closed = await service.close(
      manager,
      key,
      current.id,
      "Salida no registrada",
    );
    expect(closed).toMatchObject({
      status: "PENDIENTE",
      closedById: manager.id,
      closeReason: "Salida no registrada",
    });
    expect(
      await service.close(manager, key, current.id, "Salida no registrada"),
    ).toEqual(closed);
    expect(
      await prisma.asistenciaEvento.findMany({
        where: { attendanceId: current.id },
      }),
    ).toHaveLength(2);
    expect(
      await prisma.asistenciaEvento.findFirst({
        where: { attendanceId: current.id, action: "MANUAL_CLOSE" },
      }),
    ).toMatchObject({ actorId: manager.id, reason: "Salida no registrada" });
  });

  it("serializes own and manual closure so only one is recorded", async () => {
    await service.checkIn(owner, randomUUID());
    const id = (await service.mine(owner, { limit: 20 })).open!.id;
    const results = await Promise.allSettled([
      service.checkOut(owner, randomUUID(), id),
      service.close(manager, randomUUID(), id, "Cierre supervisado"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await prisma.asistenciaEvento.count({ where: { attendanceId: id } }),
    ).toBe(2);
  });

  it("alerts without auto-closing and paginates history without leaking another user's records", async () => {
    await service.checkIn(owner, randomUUID());
    const id = (await service.mine(owner, { limit: 20 })).open!.id;
    await prisma.asistencia.update({
      where: { id },
      data: { checkInAt: new Date(Date.now() - 13 * 3600000) },
    });
    expect((await service.mine(owner, { limit: 20 })).open).toMatchObject({
      abnormal: true,
      status: "ABIERTA",
    });
    await service.checkOut(owner, randomUUID(), id);
    await service.checkIn(owner, randomUUID());
    await service.checkIn(colleague, randomUUID());
    const page = await service.mine(owner, { limit: 1 });
    expect(page.nextCursor).not.toBeNull();
    const older = await service.mine(owner, {
      limit: 1,
      cursor: page.nextCursor!,
    });
    expect(older.items.map((item) => item.id)).toEqual([id]);
    expect(older.nextCursor).toBeNull();
    expect(older.open!.id).toBe(page.open!.id);
  });

  it("closes omitted checkout atomically before next-day entry and excludes provisional hours", async () => {
    await service.checkIn(owner, randomUUID());
    const old = (await service.mine(owner, { limit: 20 })).open!;
    vi.setSystemTime(new Date("2026-09-23T15:00:00Z"));
    await service.checkIn(owner, randomUUID());
    const result = await service.mine(owner, { limit: 20 });
    expect(result.open?.id).not.toBe(old.id);
    expect(result.items.find((row) => row.id === old.id)).toMatchObject({
      checkOutAt: "2026-09-23T05:59:00.000Z",
      requiresReview: true,
      closeReason: "CHECKOUT_OMITIDO",
      risk: { color: "ROJO" },
    });
    expect(result.bank.pendingSeconds).toBe(0);
    expect(
      await prisma.asistenciaEvento.count({
        where: { attendanceId: old.id, action: "DAILY_CUTOFF" },
      }),
    ).toBe(1);
  });

  it("rolls back validation on audit failure on real MariaDB", async () => {
    await service.checkIn(owner, randomUUID());
    const id = (await service.mine(owner, { limit: 20 })).open!.id;
    vi.setSystemTime(new Date("2026-09-22T21:00:00Z"));
    await service.checkOut(owner, randomUUID(), id);
    const closed = await prisma.asistencia.findUniqueOrThrow({ where: { id } });
    const review = new AttendanceReviewService(prisma, new AttendancePolicy(), {
      append: async () => {
        throw new Error("intentional audit failure");
      },
    } as any);
    await expect(
      review.validate(validator, id, randomUUID(), {
        version: closed.version,
        decision: "AUTORIZADA",
        reason: "Revisión comprobada",
      }),
    ).rejects.toThrow("intentional audit failure");
    expect(await prisma.asistencia.findUnique({ where: { id } })).toMatchObject(
      { status: "PENDIENTE", version: closed.version },
    );
    expect(
      await prisma.asistenciaValidacion.count({ where: { attendanceId: id } }),
    ).toBe(0);
  });

  it("serializes concurrent final decisions and accounts authorized hours once", async () => {
    await service.checkIn(owner, randomUUID());
    const id = (await service.mine(owner, { limit: 20 })).open!.id;
    vi.setSystemTime(new Date("2026-09-22T21:00:00Z"));
    await service.checkOut(owner, randomUUID(), id);
    const closed = await prisma.asistencia.findUniqueOrThrow({ where: { id } });
    const review = new AttendanceReviewService(
      prisma,
      new AttendancePolicy(),
      new AuditService(prisma),
    );
    const outcomes = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        review.validate(validator, id, randomUUID(), {
          version: closed.version,
          decision: "AUTORIZADA",
          reason: "Revisión comprobada",
        }),
      ),
    );
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await prisma.asistenciaValidacion.count({ where: { attendanceId: id } }),
    ).toBe(1);
    expect(
      (await service.mine(owner, { limit: 20 })).bank.authorizedSeconds,
    ).toBe(3600);
  });

  it("requires a usable assignment for new entries but allows closing after a transfer", async () => {
    await prisma.usuario.update({
      where: { id: owner.id },
      data: { turnoId: null },
    });
    await expect(service.checkIn(owner, randomUUID())).rejects.toMatchObject({
      status: 409,
    });
    await prisma.usuario.update({
      where: { id: owner.id },
      data: { turnoId: owner.turnoId },
    });
    await service.checkIn(owner, randomUUID());
    const current = (await service.mine(owner, { limit: 20 })).open!;
    await prisma.usuario.update({
      where: { id: owner.id },
      data: {
        sedeId: colleague.sedeId,
        areaId: colleague.areaId,
        turnoId: colleague.turnoId,
      },
    });
    try {
      expect((await service.open(manager, { limit: 20 })).items).toHaveLength(
        1,
      );
      await service.checkOut(owner, randomUUID(), current.id);
      expect((await service.mine(owner, { limit: 20 })).items[0]).toMatchObject(
        { areaId: owner.areaId, sedeId: owner.sedeId },
      );
    } finally {
      await prisma.usuario.update({
        where: { id: owner.id },
        data: {
          sedeId: owner.sedeId,
          areaId: owner.areaId,
          turnoId: owner.turnoId,
        },
      });
    }
  });
});
