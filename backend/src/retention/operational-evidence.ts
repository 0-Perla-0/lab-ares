import { Prisma } from "../generated/prisma/client";
import type { PrismaService } from "../database/prisma.service";
import type { ObjectDeletionService } from "../storage/object-deletion.service";
import { ApiException } from "../common/errors/api.exception";

export const operationalEvidencePolicies: Record<string, string> = {
  AttendanceSignals: "ASISTENCIA_HORAS",
  AbsenceEvidence: "AUSENCIAS_JUSTIFICANTES",
  VisitEvidence: "VISITAS",
};

export function redactAbsenceReceipt(value: unknown): Prisma.InputJsonValue {
  if (Array.isArray(value)) return value.map(redactAbsenceReceipt);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        key,
        ["motivo", "argumento", "resolucion", "motivoResolucion"].includes(key)
          ? "[SUPRIMIDO]"
          : val === null
            ? null
            : redactAbsenceReceipt(val),
      ]),
    ) as Prisma.InputJsonObject;
  return value as Prisma.InputJsonValue;
}

export async function operationalEvidenceExists(
  tx: Prisma.TransactionClient,
  type: string,
  id: string,
  subjectId?: number,
) {
  if (type === "AttendanceSignals") {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
      return false;
    return !!(await tx.asistencia.findFirst({
      where: { id: Number(id), ...(subjectId ? { userId: subjectId } : {}) },
    }));
  }
  if (type === "AbsenceEvidence")
    return !!(await tx.ausencia.findFirst({
      where: { id, ...(subjectId ? { userId: subjectId } : {}) },
    }));
  if (type === "VisitEvidence")
    return !!(await tx.invitacionVisita.findFirst({
      where: { id, ...(subjectId ? { anfitrionId: subjectId } : {}) },
    }));
  return false;
}

export async function suppressOperationalEvidence(
  db: PrismaService,
  deletions: ObjectDeletionService,
  type: string,
  id: string,
  transaction?: Prisma.TransactionClient,
): Promise<{ deletionJobId: string } | undefined> {
  const apply = async (
    tx: Prisma.TransactionClient,
  ): Promise<{ deletionJobId: string } | undefined> => {
    const records = await tx.registroRetencion.findMany({
      where: { resourceType: type, resourceId: id },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (const record of records) {
      await tx.$queryRaw`SELECT id FROM RegistroRetencion WHERE id = ${record.id} FOR UPDATE`;
      if (
        await tx.retencionLegal.count({
          where: { registroId: record.id, estado: "ACTIVA" },
        })
      )
        throw new ApiException("SUPPRESSION_RECORD_LEGAL_HOLD", 409);
    }
    if (type === "AttendanceSignals") {
      await tx.$queryRaw`SELECT id FROM Asistencia WHERE id = ${Number(id)} FOR UPDATE`;
      const row = await tx.asistencia.findUnique({
        where: { id: Number(id) },
      });
      if (!row) return;
      if (row.status === "ABIERTA")
        throw new ApiException("RETENTION_RESOURCE_NOT_TERMINAL", 409);
      // Keep totals, validation and policy evidence. Only raw personal signals
      // and contingency narrative are suppressed, never the attendance ledger.
      const policy = row.policySnapshot as Record<
        string,
        Prisma.InputJsonValue
      > | null;
      const { locationRules: _rules, ...publicPolicy } = policy ?? {};
      await tx.asistencia.update({
        where: { id: row.id },
        data: {
          clientIp: null,
          geoLatitude: null,
          geoLongitude: null,
          geoAccuracyMeters: null,
          checkoutSignal: Prisma.DbNull,
          contingencyJustification: null,
          policySnapshot: publicPolicy,
          evidenceSuppressedAt: row.evidenceSuppressedAt ?? new Date(),
        },
      });
      return;
    }
    if (type === "VisitEvidence") {
      await tx.$queryRaw`SELECT id FROM InvitacionVisita WHERE id = ${id} FOR UPDATE`;
      const row = await tx.invitacionVisita.findUnique({ where: { id } });
      if (!row) return;
      if (!(
        row.estado === "REGISTRADA_SALIDA" ||
        row.estado === "CANCELADA" ||
        (row.estado === "EMITIDA" && row.validaHasta < new Date())
      ))
        throw new ApiException("RETENTION_RESOURCE_NOT_TERMINAL", 409);
      const data = {
        nombreVisitante: "[SUPRIMIDO]",
        institucionProcedencia: null,
        motivo: "[SUPRIMIDO]",
        observaciones: null,
        evidenceSuppressedAt: row.evidenceSuppressedAt ?? new Date(),
      };
      await tx.invitacionVisita.update({ where: { id }, data });
      // Old idempotency receipts must not resurrect the suppressed narrative.
      await tx.$executeRaw`UPDATE DomainOperation SET response = JSON_SET(response, '$.nombreVisitante', '[SUPRIMIDO]', '$.institucionProcedencia', NULL, '$.motivo', '[SUPRIMIDO]', '$.observaciones', NULL, '$.evidenceSuppressedAt', ${data.evidenceSuppressedAt.toISOString()}) WHERE JSON_UNQUOTE(JSON_EXTRACT(response, '$.id')) = ${id}`;
      return;
    }
    if (type !== "AbsenceEvidence")
      throw new ApiException("RETENTION_ADAPTER_UNAVAILABLE", 501);
    await tx.$queryRaw`SELECT id FROM Ausencia WHERE id = ${id} FOR UPDATE`;
    const row = await tx.ausencia.findUnique({
      where: { id },
      include: { justificaciones: true, apelacion: true },
    });
    if (!row) return;
    const now = new Date();
    if (
      !["JUSTIFICADA", "NO_JUSTIFICADA", "CANCELADA"].includes(row.estado) ||
      (row.apelacion && !row.apelacion.resolvedAt) ||
      (row.apelacionLimiteAt && row.apelacionLimiteAt >= now)
    )
      throw new ApiException("RETENTION_RESOURCE_NOT_TERMINAL", 409);
    const ids = [
      ...new Set(
        [
          ...row.justificaciones.map((j) => j.archivoId),
          row.apelacion?.archivoId,
        ].filter((value): value is string => !!value),
      ),
    ].sort();
    // Do not silently fall back to irreversible DELETE under an SQL rollback.
    // Institutional absence attachments need their dedicated phased adapter;
    // DB-only attendance/visit evidence remains supported.
    for (const fileId of ids) {
      await tx.$queryRaw`SELECT id FROM Archivo WHERE id = ${fileId} FOR UPDATE`;
      const file = await tx.archivo.findUnique({
        where: { id: fileId },
        include: {
          _count: {
            select: {
              documentoVersiones: true,
              kairosEvidence: true,
              reportExports: true,
              trabajosImpresion3D: true,
            },
          },
          bibliotecaVersion: true,
          activoPublico: true,
        },
      });
      if (!file) continue;
      const otherAbsence =
        (await tx.justificacionAusencia.count({
          where: { archivoId: fileId, ausenciaId: { not: id } },
        })) +
        (await tx.apelacionAusencia.count({
          where: { archivoId: fileId, ausenciaId: { not: id } },
        }));
      const holds = await tx.retencionLegal.count({
        where: { estado: "ACTIVA", registro: { resourceId: fileId } },
      });
      if (
        otherAbsence ||
        holds ||
        Object.values(file._count).some(Boolean) ||
        file.bibliotecaVersion ||
        file.activoPublico
      )
        throw new ApiException("RETENTION_SHARED_EVIDENCE_OR_HOLD", 409);
    }
    // Attachments leave through the durable phased protocol, one intent per file.
    // Text is redacted only after every attachment is verified gone; until then
    // the retention item stays pending and the caller drives each job.
    if (ids.length && !transaction)
      throw new ApiException("OBJECT_DELETION_PROTOCOL_REQUIRED", 409);
    for (const fileId of ids) {
      const existing = await tx.objectDeletionJob.findUnique({
        where: { fileId },
      });
      if (existing) {
        if (
          existing.purpose !== "ABSENCE_ATTACHMENT" ||
          existing.resourceId !== id
        )
          throw new ApiException("OBJECT_DELETION_PURPOSE_MISMATCH", 409);
        if (existing.state !== "VERIFIED" && existing.state !== "COMPLETE")
          return { deletionJobId: existing.id };
        await deletions.complete(tx, existing.id);
        continue;
      }
      const job = await deletions.prepare(tx, fileId, "ABSENCE_ATTACHMENT", id);
      return { deletionJobId: job.id };
    }
    await tx.ausencia.update({
      where: { id },
      data: {
        motivoResolucion: "[SUPRIMIDO]",
        evidenceSuppressedAt: row.evidenceSuppressedAt ?? now,
      },
    });
    await tx.justificacionAusencia.updateMany({
      where: { ausenciaId: id },
      data: { motivo: "[SUPRIMIDO]" },
    });
    await tx.apelacionAusencia.updateMany({
      where: { ausenciaId: id },
      data: { argumento: "[SUPRIMIDO]", resolucion: "[SUPRIMIDO]" },
    });
    const receipts = await tx.absenceOperation.findMany({
      where: { response: { path: "$.id", equals: id } },
    });
    for (const receipt of receipts)
      await tx.absenceOperation.update({
        where: {
          actorId_key: { actorId: receipt.actorId, key: receipt.key },
        },
        data: { response: redactAbsenceReceipt(receipt.response) },
      });
    return undefined;
  };
  if (transaction) return apply(transaction);
  return db.$transaction(apply, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: 30000,
  });
}
