import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";

import type { AuthUser } from "../auth/auth-user";
import { conflict } from "../common/errors/domain-error";
import { UniqueConstraintError } from "../common/errors/unique-constraint-error";
import { ServerClock } from "../common/time/server-clock";
import {
  EstadoValidacionAsistencia,
  TipoOperacionAsistencia,
} from "../generated/prisma/enums";
import type { RegistrarAsistenciaInput } from "./attendance.schemas";
import {
  AttendanceRepository,
  type AttendanceRecord,
} from "./attendance.repository";
import {
  ATTENDANCE_RISK_POLICY_VERSION,
  AttendanceRiskPolicy,
} from "./attendance-risk.policy";

type RequestContext = { ip?: string };

@Injectable()
export class AttendanceService {
  constructor(
    private readonly attendance: AttendanceRepository,
    private readonly clock: ServerClock,
    private readonly risk: AttendanceRiskPolicy,
  ) {}

  async checkIn(
    user: AuthUser,
    key: string,
    input: RegistrarAsistenciaInput,
    context: RequestContext,
  ) {
    const fingerprint = requestFingerprint(input);
    const replay = await this.findReplay(
      user.id,
      TipoOperacionAsistencia.CHECK_IN,
      key,
      fingerprint,
    );
    if (replay) return toPublicAttendance(replay);

    const at = this.clock.now();
    const turno = await this.attendance.findTurno(user.turnoId);
    const evaluation = this.risk.evaluateCheckIn(at, turno);

    try {
      return toPublicAttendance(
        await this.attendance.createCheckIn({
          attendanceId: randomUUID(),
          operationId: randomUUID(),
          user,
          key,
          fingerprint,
          at,
          evidence: toEvidence(input, context),
          nivelRiesgo: evaluation.nivel,
          motivosRiesgo: evaluation.motivos,
          versionReglaRiesgo: ATTENDANCE_RISK_POLICY_VERSION,
        }),
      );
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;

      const concurrentReplay = await this.findReplay(
        user.id,
        TipoOperacionAsistencia.CHECK_IN,
        key,
        fingerprint,
      );
      if (concurrentReplay) return toPublicAttendance(concurrentReplay);
      throw conflict("ATTENDANCE_ALREADY_OPEN");
    }
  }

  async checkOut(
    user: AuthUser,
    key: string,
    input: RegistrarAsistenciaInput,
    context: RequestContext,
  ) {
    const fingerprint = requestFingerprint(input);
    const replay = await this.findReplay(
      user.id,
      TipoOperacionAsistencia.CHECK_OUT,
      key,
      fingerprint,
    );
    if (replay) return toPublicAttendance(replay);

    const current = await this.attendance.findCurrent(user.id);
    if (!current) {
      const concurrentReplay = await this.findReplay(
        user.id,
        TipoOperacionAsistencia.CHECK_OUT,
        key,
        fingerprint,
      );
      if (concurrentReplay) return toPublicAttendance(concurrentReplay);
      throw conflict("ATTENDANCE_NOT_OPEN");
    }

    const at = this.clock.now();
    const evaluation = this.risk.evaluateCheckOut(
      current.entradaAt,
      at,
      riskReasons(current.motivosRiesgo),
    );

    try {
      return toPublicAttendance(
        await this.attendance.closeCheckOut({
          attendanceId: current.id,
          operationId: randomUUID(),
          user,
          key,
          fingerprint,
          at,
          evidence: toEvidence(input, context),
          duracionMinutos: evaluation.duracionMinutos,
          nivelRiesgo: evaluation.nivel,
          motivosRiesgo: evaluation.motivos,
          versionReglaRiesgo: ATTENDANCE_RISK_POLICY_VERSION,
          estadoValidacion: EstadoValidacionAsistencia.PENDIENTE,
        }),
      );
    } catch (error) {
      if (
        !(error instanceof UniqueConstraintError) &&
        !isDomainCode(error, "ATTENDANCE_NOT_OPEN")
      ) {
        throw error;
      }

      const concurrentReplay = await this.findReplay(
        user.id,
        TipoOperacionAsistencia.CHECK_OUT,
        key,
        fingerprint,
      );
      if (concurrentReplay) return toPublicAttendance(concurrentReplay);
      throw conflict("ATTENDANCE_NOT_OPEN");
    }
  }

  async current(userId: number) {
    const current = await this.attendance.findCurrent(userId);
    return current ? toPublicAttendance(current) : null;
  }

  async ownHistory(userId: number) {
    return (await this.attendance.findOwnHistory(userId)).map(
      toPublicAttendance,
    );
  }

  private async findReplay(
    userId: number,
    type: TipoOperacionAsistencia,
    key: string,
    fingerprint: string,
  ): Promise<AttendanceRecord | null> {
    const operation = await this.attendance.findIdempotentOperation(
      userId,
      type,
      key,
    );
    if (!operation) return null;
    if (operation.huellaSolicitud !== fingerprint) {
      throw conflict("IDEMPOTENCY_KEY_REUSED");
    }
    return operation.asistencia;
  }
}

function requestFingerprint(input: RegistrarAsistenciaInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function toEvidence(input: RegistrarAsistenciaInput, context: RequestContext) {
  return {
    latitud: input.ubicacion?.latitud,
    longitud: input.ubicacion?.longitud,
    precisionMetros: input.ubicacion?.precisionMetros,
    ip: context.ip,
  };
}

function riskReasons(value: PrismaJsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((reason): reason is string => typeof reason === "string")
    : [];
}

type PrismaJsonValue = AttendanceRecord["motivosRiesgo"];

function toPublicAttendance(record: AttendanceRecord) {
  return {
    id: record.id,
    usuarioId: record.usuarioId,
    sedeId: record.sedeId,
    areaId: record.areaId,
    turnoId: record.turnoId,
    estado: record.estado,
    entradaAt: record.entradaAt,
    salidaAt: record.salidaAt,
    duracionMinutos: record.duracionMinutos,
    nivelRiesgo: record.nivelRiesgo,
    motivosRiesgo: riskReasons(record.motivosRiesgo),
    versionReglaRiesgo: record.versionReglaRiesgo,
    estadoValidacion: record.estadoValidacion,
    evidenciaEntrada: {
      ubicacionRegistrada:
        record.entradaLatitud !== null && record.entradaLongitud !== null,
      ipRegistrada: record.entradaIp !== null,
    },
    evidenciaSalida: {
      ubicacionRegistrada:
        record.salidaLatitud !== null && record.salidaLongitud !== null,
      ipRegistrada: record.salidaIp !== null,
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isDomainCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
