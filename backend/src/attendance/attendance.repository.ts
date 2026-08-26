import { Injectable } from "@nestjs/common";

import { conflict } from "../common/errors/domain-error";
import { translateUniqueViolation } from "../organization/repositories/prisma-errors";
import type { AuthUser } from "../auth/auth-user";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import type {
  EstadoValidacionAsistencia,
  NivelRiesgoAsistencia,
  TipoOperacionAsistencia,
} from "../generated/prisma/enums";

const attendanceSelect = {
  id: true,
  usuarioId: true,
  sedeId: true,
  areaId: true,
  turnoId: true,
  estado: true,
  entradaAt: true,
  salidaAt: true,
  openSlot: true,
  duracionMinutos: true,
  nivelRiesgo: true,
  motivosRiesgo: true,
  versionReglaRiesgo: true,
  estadoValidacion: true,
  entradaLatitud: true,
  entradaLongitud: true,
  entradaPrecisionMetros: true,
  entradaIp: true,
  salidaLatitud: true,
  salidaLongitud: true,
  salidaPrecisionMetros: true,
  salidaIp: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AttendanceRecord = Prisma.AsistenciaGetPayload<{
  select: typeof attendanceSelect;
}>;

type Evidence = {
  latitud?: number;
  longitud?: number;
  precisionMetros?: number;
  ip?: string;
};

type CreateCheckInData = {
  attendanceId: string;
  operationId: string;
  user: AuthUser;
  key: string;
  fingerprint: string;
  at: Date;
  evidence: Evidence;
  nivelRiesgo: NivelRiesgoAsistencia;
  motivosRiesgo: string[];
  versionReglaRiesgo: string;
};

type CloseCheckOutData = {
  attendanceId: string;
  operationId: string;
  user: AuthUser;
  key: string;
  fingerprint: string;
  at: Date;
  evidence: Evidence;
  duracionMinutos: number;
  nivelRiesgo: NivelRiesgoAsistencia;
  motivosRiesgo: string[];
  versionReglaRiesgo: string;
  estadoValidacion: EstadoValidacionAsistencia;
};

@Injectable()
export class AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCurrent(usuarioId: number) {
    return this.prisma.asistencia.findFirst({
      where: { usuarioId, openSlot: true },
      select: attendanceSelect,
    });
  }

  findOwnHistory(usuarioId: number) {
    return this.prisma.asistencia.findMany({
      where: { usuarioId },
      orderBy: [{ entradaAt: "desc" }, { id: "desc" }],
      take: 50,
      select: attendanceSelect,
    });
  }

  findTurno(turnoId: number | null) {
    if (turnoId === null) return Promise.resolve(null);

    return this.prisma.turno.findUnique({
      where: { id: turnoId },
      include: { dias: true },
    });
  }

  async findIdempotentOperation(
    usuarioId: number,
    tipo: TipoOperacionAsistencia,
    clave: string,
  ) {
    return this.prisma.operacionIdempotenteAsistencia.findUnique({
      where: { usuarioId_tipo_clave: { usuarioId, tipo, clave } },
      select: {
        huellaSolicitud: true,
        asistencia: { select: attendanceSelect },
      },
    });
  }

  createCheckIn(input: CreateCheckInData): Promise<AttendanceRecord> {
    return translateUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        const attendance = await tx.asistencia.create({
          data: {
            id: input.attendanceId,
            usuarioId: input.user.id,
            sedeId: input.user.sedeId,
            areaId: input.user.areaId,
            turnoId: input.user.turnoId,
            entradaAt: input.at,
            entradaLatitud: input.evidence.latitud,
            entradaLongitud: input.evidence.longitud,
            entradaPrecisionMetros: input.evidence.precisionMetros,
            entradaIp: input.evidence.ip,
            nivelRiesgo: input.nivelRiesgo,
            motivosRiesgo: input.motivosRiesgo,
            versionReglaRiesgo: input.versionReglaRiesgo,
          },
          select: attendanceSelect,
        });

        await tx.operacionIdempotenteAsistencia.create({
          data: {
            id: input.operationId,
            usuarioId: input.user.id,
            asistenciaId: input.attendanceId,
            tipo: "CHECK_IN",
            clave: input.key,
            huellaSolicitud: input.fingerprint,
          },
        });

        await tx.eventoAuditoria.create({
          data: {
            actorUsuarioId: input.user.id,
            actorRol: input.user.rol,
            actorAlcance: "self",
            correlacionId: input.operationId,
            accion: "ATTENDANCE_CHECK_IN",
            objetoTipo: "Asistencia",
            objetoId: input.attendanceId,
            resultado: "EXITO",
            diffPermitido: {
              estado: { desde: null, hacia: "ABIERTA" },
              ubicacionRegistrada: input.evidence.latitud !== undefined,
              ipRegistrada: input.evidence.ip !== undefined,
            },
            versionPolitica: input.versionReglaRiesgo,
          },
        });

        return attendance;
      }),
    );
  }

  closeCheckOut(input: CloseCheckOutData): Promise<AttendanceRecord> {
    return translateUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        const update = await tx.asistencia.updateMany({
          where: {
            id: input.attendanceId,
            usuarioId: input.user.id,
            openSlot: true,
          },
          data: {
            estado: "CERRADA",
            salidaAt: input.at,
            openSlot: null,
            salidaLatitud: input.evidence.latitud,
            salidaLongitud: input.evidence.longitud,
            salidaPrecisionMetros: input.evidence.precisionMetros,
            salidaIp: input.evidence.ip,
            duracionMinutos: input.duracionMinutos,
            nivelRiesgo: input.nivelRiesgo,
            motivosRiesgo: input.motivosRiesgo,
            versionReglaRiesgo: input.versionReglaRiesgo,
            estadoValidacion: input.estadoValidacion,
          },
        });

        if (update.count !== 1) {
          throw conflict("ATTENDANCE_NOT_OPEN");
        }

        await tx.operacionIdempotenteAsistencia.create({
          data: {
            id: input.operationId,
            usuarioId: input.user.id,
            asistenciaId: input.attendanceId,
            tipo: "CHECK_OUT",
            clave: input.key,
            huellaSolicitud: input.fingerprint,
          },
        });

        await tx.eventoAuditoria.create({
          data: {
            actorUsuarioId: input.user.id,
            actorRol: input.user.rol,
            actorAlcance: "self",
            correlacionId: input.operationId,
            accion: "ATTENDANCE_CHECK_OUT",
            objetoTipo: "Asistencia",
            objetoId: input.attendanceId,
            resultado: "EXITO",
            diffPermitido: {
              estado: { desde: "ABIERTA", hacia: "CERRADA" },
              duracionMinutos: input.duracionMinutos,
              nivelRiesgo: input.nivelRiesgo,
              motivosRiesgo: input.motivosRiesgo,
              ubicacionRegistrada: input.evidence.latitud !== undefined,
              ipRegistrada: input.evidence.ip !== undefined,
            },
            versionPolitica: input.versionReglaRiesgo,
          },
        });

        return tx.asistencia.findUniqueOrThrow({
          where: { id: input.attendanceId },
          select: attendanceSelect,
        });
      }),
    );
  }
}
