import type { Prisma } from "../../generated/prisma/client";
import { mexicoInstant, nextDay, weekday } from "../../calendar/calendar-time";

export type HistoryResource = "USER" | "SHIFT" | "AREA" | "SEDE";

// Same transaction as the source mutation. No identity secrets are copied.
export async function recordOperationalHistory(
  tx: Prisma.TransactionClient,
  resourceType: HistoryResource,
  resourceId: number,
) {
  let snapshot: Prisma.InputJsonObject;
  switch (resourceType) {
    case "USER": {
      const row = await tx.usuario.findUniqueOrThrow({
        where: { id: resourceId },
      });
      snapshot = {
        rol: row.rol,
        estado: row.estado,
        sedeId: row.sedeId,
        areaId: row.areaId,
        turnoId: row.turnoId,
      };
      break;
    }
    case "SHIFT": {
      const row = await tx.turno.findUniqueOrThrow({
        where: { id: resourceId },
        include: { dias: true },
      });
      snapshot = {
        activo: row.activo,
        areaId: row.areaId,
        horaInicio: row.horaInicio.toISOString().slice(11, 19),
        horaFin: row.horaFin.toISOString().slice(11, 19),
        dias: row.dias.map((d) => d.dia),
      };
      break;
    }
    case "AREA": {
      const row = await tx.area.findUniqueOrThrow({
        where: { id: resourceId },
      });
      snapshot = { activa: row.activa, sedeId: row.sedeId };
      break;
    }
    case "SEDE": {
      const row = await tx.sede.findUniqueOrThrow({
        where: { id: resourceId },
      });
      snapshot = { activa: row.activa };
    }
  }
  // Capture the server instant only AFTER the source mutation/row lock. This
  // avoids both an earlier lock-wait timestamp and DB session timezone defaults.
  const previous = await tx.operationalHistory.findFirst({
    where: { resourceType, resourceId },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
  });
  function canonical(value: unknown): string {
    if (Array.isArray(value))
      return JSON.stringify(value.map(canonical).sort());
    if (value && typeof value === "object")
      return JSON.stringify(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => [
            key,
            ["activa", "activo"].includes(key) ? Boolean(val) : canonical(val),
          ]),
      );
    return JSON.stringify(value);
  }
  if (previous && canonical(previous.snapshot) === canonical(snapshot)) return;
  await tx.operationalHistory.create({
    data: { resourceType, resourceId, snapshot, recordedAt: new Date() },
  });
}

export async function historicalDuty(
  tx: Prisma.TransactionClient,
  userId: number,
  day: string,
) {
  const start = mexicoInstant(day),
    end = mexicoInstant(nextDay(day));
  async function state(resourceType: HistoryResource, resourceId: number) {
    const row = await tx.operationalHistory.findFirst({
      where: { resourceType, resourceId, recordedAt: { lte: start } },
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    });
    if (!row) return null;
    const changed = await tx.operationalHistory.findFirst({
      where: { resourceType, resourceId, recordedAt: { gt: start, lt: end } },
    });
    if (changed) return null;
    return row.snapshot as Record<string, unknown>;
  }
  const user = await state("USER", userId);
  if (!user) return { reason: "ASSIGNMENT_HISTORY_UNKNOWN" } as const;
  if (
    user.rol !== "PRESTADOR" ||
    user.estado !== "ACTIVA" ||
    !user.sedeId ||
    !user.areaId ||
    !user.turnoId
  )
    return { eligible: false } as const;
  const sede = await state("SEDE", Number(user.sedeId));
  const area = await state("AREA", Number(user.areaId));
  const shift = await state("SHIFT", Number(user.turnoId));
  if (!sede || !area || !shift)
    return { reason: "ORGANIZATION_HISTORY_UNKNOWN" } as const;
  if (!Array.isArray(shift.dias))
    return { reason: "SHIFT_HISTORY_INVALID" } as const;
  return {
    eligible:
      !!sede.activa &&
      !!area.activa &&
      !!shift.activo &&
      area.sedeId === user.sedeId &&
      shift.areaId === user.areaId,
    isShiftDay: shift.dias.includes(weekday(day)),
    id: userId,
    sedeId: Number(user.sedeId),
    areaId: Number(user.areaId),
    turnoId: Number(user.turnoId),
  } as const;
}
