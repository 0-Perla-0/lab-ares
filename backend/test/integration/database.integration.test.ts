import { ConfigService } from "@nestjs/config";
import { config } from "dotenv";
import type session from "express-session";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaSessionStore } from "../../src/auth/prisma-session.store";
import { AttendanceRepository } from "../../src/attendance/attendance.repository";
import { AttendanceRiskPolicy } from "../../src/attendance/attendance-risk.policy";
import { AttendanceService } from "../../src/attendance/attendance.service";
import { UniqueConstraintError } from "../../src/common/errors/unique-constraint-error";
import { ServerClock } from "../../src/common/time/server-clock";
import { PrismaService } from "../../src/database/prisma.service";
import { EstadoUsuario, RolUsuario } from "../../src/generated/prisma/enums";
import { SedeRepository } from "../../src/organization/repositories/sede.repository";

config({ path: [".env", "../.env"], quiet: true });

const sessionId = `phase0-integration-session-${process.pid}`;
const sedeName = `phase0-integration-sede-${process.pid}-${Date.now()}`;
const attendanceUserCode = `ATT${process.pid}${Date.now()}`;
const prisma = new PrismaService(
  new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
);
const sessions = new PrismaSessionStore(prisma);
const sedes = new SedeRepository(prisma);

describe("MariaDB integration", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    const attendanceUser = await prisma.usuario.findUnique({
      where: { codigo: attendanceUserCode },
      select: { id: true },
    });
    if (attendanceUser) {
      await prisma.operacionIdempotenteAsistencia.deleteMany({
        where: { usuarioId: attendanceUser.id },
      });
      await prisma.eventoAuditoria.deleteMany({
        where: { actorUsuarioId: attendanceUser.id },
      });
      await prisma.asistencia.deleteMany({
        where: { usuarioId: attendanceUser.id },
      });
      await prisma.usuario.delete({ where: { id: attendanceUser.id } });
    }
    await prisma.session.deleteMany({ where: { id: sessionId } });
    await prisma.sede.deleteMany({ where: { nombre: sedeName } });
    await prisma.$disconnect();
  });

  it("persists sessions through the real Prisma store", async () => {
    const value = createSession();
    await setSession(sessionId, value);

    await expect(getSession(sessionId)).resolves.toMatchObject({ userId: 42 });
    await destroySession(sessionId);
    await expect(getSession(sessionId)).resolves.toBeNull();
  });

  it("translates a real unique-index violation", async () => {
    await sedes.create({ nombre: sedeName, direccion: null });

    await expect(
      sedes.create({ nombre: sedeName, direccion: null }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it("keeps concurrent attendance retries idempotent in MariaDB", async () => {
    const created = await prisma.usuario.create({
      data: {
        codigo: attendanceUserCode,
        email: `${attendanceUserCode.toLowerCase()}@ares.local`,
        passwordHash: "integration-test-not-a-real-credential",
        rol: RolUsuario.PRESTADOR,
        estado: EstadoUsuario.ACTIVO,
      },
    });
    const user = {
      id: created.id,
      codigo: created.codigo,
      email: created.email,
      rol: created.rol,
      estado: created.estado,
      sedeId: created.sedeId,
      areaId: created.areaId,
      turnoId: created.turnoId,
    };
    const repository = new AttendanceRepository(prisma);
    const service = new AttendanceService(
      repository,
      new ServerClock(),
      new AttendanceRiskPolicy(
        new ConfigService({ APP_TIME_ZONE: "America/Mexico_City" }),
      ),
    );
    const checkInKey = `integration-check-in-${process.pid}-${Date.now()}`;

    const checkIns = await Promise.all([
      service.checkIn(user, checkInKey, {}, {}),
      service.checkIn(user, checkInKey, {}, {}),
    ]);
    expect(checkIns[0].id).toBe(checkIns[1].id);
    await expect(
      service.checkIn(
        user,
        `integration-second-check-in-${process.pid}`,
        {},
        {},
      ),
    ).rejects.toMatchObject({ code: "ATTENDANCE_ALREADY_OPEN" });

    const checkOutKey = `integration-check-out-${process.pid}-${Date.now()}`;
    const checkOuts = await Promise.all([
      service.checkOut(user, checkOutKey, {}, {}),
      service.checkOut(user, checkOutKey, {}, {}),
    ]);
    expect(checkOuts[0].id).toBe(checkOuts[1].id);
    expect(checkOuts[0].estado).toBe("CERRADA");
    await expect(
      service.checkOut(
        user,
        `integration-second-check-out-${process.pid}`,
        {},
        {},
      ),
    ).rejects.toMatchObject({ code: "ATTENDANCE_NOT_OPEN" });

    await expect(
      prisma.asistencia.count({ where: { usuarioId: user.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.operacionIdempotenteAsistencia.count({
        where: { usuarioId: user.id },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.eventoAuditoria.count({
        where: { actorUsuarioId: user.id },
      }),
    ).resolves.toBe(2);
  });
});

function createSession(): session.SessionData {
  return {
    cookie: {
      originalMaxAge: 60_000,
      expires: new Date(Date.now() + 60_000),
      httpOnly: true,
      path: "/",
    },
    userId: 42,
  };
}

function setSession(id: string, value: session.SessionData): Promise<void> {
  return new Promise((resolve, reject) => {
    sessions.set(id, value, (error) => (error ? reject(error) : resolve()));
  });
}

function getSession(id: string): Promise<session.SessionData | null> {
  return new Promise((resolve, reject) => {
    sessions.get(id, (error, value) =>
      error ? reject(error) : resolve(value ?? null),
    );
  });
}

function destroySession(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sessions.destroy(id, (error) => (error ? reject(error) : resolve()));
  });
}
