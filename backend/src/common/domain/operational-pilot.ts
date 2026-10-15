import type { ConfigService } from "@nestjs/config";
import { ApiException } from "../errors/api.exception";

export function pilotWhere(config: ConfigService) {
  const ids = (key: string) =>
    (config.get<string>(key, "") || "").split(",").filter(Boolean).map(Number);
  const sedes = ids("OPERATIONAL_PILOT_SEDE_IDS"),
    areas = ids("OPERATIONAL_PILOT_AREA_IDS");
  return {
    ...(sedes.length ? { sedeId: { in: sedes } } : {}),
    ...(areas.length ? { areaId: { in: areas } } : {}),
  };
}
export function pilotAllows(
  config: ConfigService,
  target: { sedeId?: number | null; areaId?: number | null },
) {
  const where = pilotWhere(config);
  return (
    (!where.sedeId || where.sedeId.in.includes(target.sedeId ?? -1)) &&
    (!where.areaId || where.areaId.in.includes(target.areaId ?? -1))
  );
}
export function requirePilot(
  config: ConfigService,
  target: { sedeId?: number | null; areaId?: number | null },
) {
  if (!pilotAllows(config, target))
    throw new ApiException("FEATURE_OUTSIDE_PILOT", 404);
}
