import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AttendanceRepository } from "../../../src/attendance/attendance.repository";
import type { AttendanceRiskPolicy } from "../../../src/attendance/attendance-risk.policy";
import { AttendanceService } from "../../../src/attendance/attendance.service";
import type { AuthUser } from "../../../src/auth/auth-user";
import { UniqueConstraintError } from "../../../src/common/errors/unique-constraint-error";
import type { ServerClock } from "../../../src/common/time/server-clock";
import {
  EstadoAsistencia,
  EstadoUsuario,
  EstadoValidacionAsistencia,
  NivelRiesgoAsistencia,
  RolUsuario,
} from "../../../src/generated/prisma/enums";

const now = new Date("2026-08-24T15:00:00.000Z");
const later = new Date("2026-08-24T16:00:00.000Z");
const user: AuthUser = {
  id: 10,
  codigo: "USER010",
  email: "user10@ares.local",
  rol: RolUsuario.PRESTADOR,
  estado: EstadoUsuario.ACTIVO,
  sedeId: 1,
  areaId: 2,
  turnoId: 3,
};
const openAttendance = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  usuarioId: user.id,
  sedeId: user.sedeId,
  areaId: user.areaId,
  turnoId: user.turnoId,
  estado: EstadoAsistencia.ABIERTA,
  entradaAt: now,
  salidaAt: null,
  openSlot: true,
  duracionMinutos: null,
  nivelRiesgo: NivelRiesgoAsistencia.NO_EVALUADO,
  motivosRiesgo: [],
  versionReglaRiesgo: "attendance-risk-2026-08-25-v1",
  estadoValidacion: EstadoValidacionAsistencia.PENDIENTE,
  entradaLatitud: null,
  entradaLongitud: null,
  entradaPrecisionMetros: null,
  entradaIp: "127.0.0.1",
  salidaLatitud: null,
  salidaLongitud: null,
  salidaPrecisionMetros: null,
  salidaIp: null,
  createdAt: now,
  updatedAt: now,
};
const closedAttendance = {
  ...openAttendance,
  estado: EstadoAsistencia.CERRADA,
  salidaAt: later,
  openSlot: null,
  duracionMinutos: 60,
  nivelRiesgo: NivelRiesgoAsistencia.VERDE,
  salidaIp: "127.0.0.1",
  updatedAt: later,
};
const repository = {
  findCurrent: vi.fn(),
  findOwnHistory: vi.fn(),
  findTurno: vi.fn(),
  findIdempotentOperation: vi.fn(),
  createCheckIn: vi.fn(),
  closeCheckOut: vi.fn(),
};
const clock = { now: vi.fn() };
const risk = { evaluateCheckIn: vi.fn(), evaluateCheckOut: vi.fn() };
const service = new AttendanceService(
  repository as unknown as AttendanceRepository,
  clock as unknown as ServerClock,
  risk as unknown as AttendanceRiskPolicy,
);
const key = "550e8400-e29b-41d4-a716-446655440001";

describe("AttendanceService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clock.now.mockReturnValue(now);
    repository.findIdempotentOperation.mockResolvedValue(null);
    repository.findTurno.mockResolvedValue(null);
    repository.createCheckIn.mockResolvedValue(openAttendance);
    repository.findCurrent.mockResolvedValue(openAttendance);
    repository.closeCheckOut.mockResolvedValue(closedAttendance);
    repository.findOwnHistory.mockResolvedValue([closedAttendance]);
    risk.evaluateCheckIn.mockReturnValue({
      nivel: NivelRiesgoAsistencia.NO_EVALUADO,
      motivos: [],
    });
    risk.evaluateCheckOut.mockReturnValue({
      nivel: NivelRiesgoAsistencia.VERDE,
      motivos: [],
      duracionMinutos: 60,
    });
  });

  it("creates check-in with server time, scope snapshot and observed evidence", async () => {
    await service.checkIn(
      user,
      key,
      {
        ubicacion: {
          latitud: 19.4326,
          longitud: -99.1332,
          precisionMetros: 8,
        },
      },
      { ip: "127.0.0.1" },
    );

    expect(repository.createCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        user,
        key,
        at: now,
        evidence: {
          latitud: 19.4326,
          longitud: -99.1332,
          precisionMetros: 8,
          ip: "127.0.0.1",
        },
      }),
    );
  });

  it("replays an existing operation without writing again", async () => {
    repository.findIdempotentOperation.mockResolvedValue({
      huellaSolicitud:
        "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
      asistencia: openAttendance,
    });

    await expect(service.checkIn(user, key, {}, {})).resolves.toMatchObject({
      id: openAttendance.id,
      estado: EstadoAsistencia.ABIERTA,
    });
    expect(repository.createCheckIn).not.toHaveBeenCalled();
  });

  it("rejects reusing a key with a different request", async () => {
    repository.findIdempotentOperation.mockResolvedValue({
      huellaSolicitud: "different-fingerprint",
      asistencia: openAttendance,
    });

    await expect(service.checkIn(user, key, {}, {})).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
    });
  });

  it("maps an open-session uniqueness race to a stable conflict", async () => {
    repository.createCheckIn.mockRejectedValue(new UniqueConstraintError());

    await expect(service.checkIn(user, key, {}, {})).rejects.toMatchObject({
      code: "ATTENDANCE_ALREADY_OPEN",
    });
  });

  it("closes the current session with derived duration and risk", async () => {
    clock.now.mockReturnValue(later);
    await service.checkOut(user, key, {}, { ip: "127.0.0.1" });

    expect(risk.evaluateCheckOut).toHaveBeenCalledWith(now, later, []);
    expect(repository.closeCheckOut).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceId: openAttendance.id,
        at: later,
        duracionMinutos: 60,
        nivelRiesgo: NivelRiesgoAsistencia.VERDE,
      }),
    );
  });

  it("rejects check-out without an open session", async () => {
    repository.findCurrent.mockResolvedValue(null);
    await expect(service.checkOut(user, key, {}, {})).rejects.toMatchObject({
      code: "ATTENDANCE_NOT_OPEN",
    });
  });

  it("rechecks idempotency if a concurrent check-out closes the session", async () => {
    repository.findCurrent.mockResolvedValue(null);
    repository.findIdempotentOperation
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        huellaSolicitud:
          "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        asistencia: closedAttendance,
      });

    await expect(service.checkOut(user, key, {}, {})).resolves.toMatchObject({
      id: closedAttendance.id,
      estado: EstadoAsistencia.CERRADA,
    });
  });

  it("returns only evidence flags, never raw coordinates or IP", async () => {
    const result = await service.current(user.id);
    expect(result).toMatchObject({
      evidenciaEntrada: {
        ubicacionRegistrada: false,
        ipRegistrada: true,
      },
    });
    expect(result).not.toHaveProperty("entradaIp");
    expect(result).not.toHaveProperty("entradaLatitud");
  });
});
