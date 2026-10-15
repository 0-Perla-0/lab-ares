import { BlockList, isIP } from "node:net";
import { z } from "zod";
import type { Risk } from "./attendance-risk";

export const coordinatesSchema = z.strictObject({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(100000),
});
export const locationPolicySchema = z
  .strictObject({
    mode: z.enum([
      "SIN_VALIDACION",
      "UBICACION_INFORMATIVA",
      "RED_INFORMATIVA",
      "UBICACION_Y_RED",
    ]),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    radiusMeters: z.number().min(1).max(100000).optional(),
    maxAccuracyMeters: z.number().min(1).max(100000).default(200),
    networks: z
      .array(z.string().refine(validCidr, "Invalid CIDR"))
      .max(100)
      .default([]),
  })
  .superRefine((p, ctx) => {
    if (
      ["UBICACION_INFORMATIVA", "UBICACION_Y_RED"].includes(p.mode) &&
      (p.latitude === undefined ||
        p.longitude === undefined ||
        p.radiusMeters === undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "Location center and radius required",
      });
    if (
      ["RED_INFORMATIVA", "UBICACION_Y_RED"].includes(p.mode) &&
      !p.networks.length
    )
      ctx.addIssue({ code: "custom", message: "Networks required" });
  });
export type LocationPolicy = z.infer<typeof locationPolicySchema>;
export type SignalInput = { coords?: unknown; clientIp?: string | null };

export function validCidr(value: string): boolean {
  const [ip, prefix, extra] = value.split("/");
  const version = isIP(ip);
  return (
    !extra &&
    !!version &&
    prefix !== undefined &&
    /^\d+$/.test(prefix) &&
    Number(prefix) <= (version === 4 ? 32 : 128)
  );
}
export function inNetworks(
  ip: string | null | undefined,
  networks: string[],
): boolean {
  if (!ip || !isIP(ip)) return false;
  const list = new BlockList();
  for (const cidr of networks) {
    if (!validCidr(cidr)) continue;
    const [address, prefix] = cidr.split("/");
    list.addSubnet(
      address,
      Number(prefix),
      isIP(address) === 4 ? "ipv4" : "ipv6",
    );
  }
  return list.check(ip, isIP(ip) === 4 ? "ipv4" : "ipv6");
}
export function normalizeIp(ip?: string | null) {
  if (!ip) return null;
  const value =
    ip.toLowerCase().startsWith("::ffff:") && isIP(ip.slice(7)) === 4
      ? ip.slice(7)
      : ip;
  return isIP(value) ? value : null;
}
/** Walk from the socket towards the client; stop at the first untrusted hop. */
export function clientIp(
  remote: string | undefined,
  forwarded: string | string[] | undefined,
  trusted: string[],
) {
  let current = normalizeIp(remote);
  if (
    !current ||
    !inNetworks(current, trusted) ||
    typeof forwarded !== "string" ||
    forwarded.length > 4096
  )
    return current;
  const hops = forwarded.split(",").map((ip) => normalizeIp(ip.trim()));
  if (hops.some((ip) => !ip)) return current;
  for (let i = hops.length - 1; i >= 0 && inNetworks(current, trusted); i--)
    current = hops[i];
  return current;
}
export function distanceMeters(a: number, b: number, c: number, d: number) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const h =
    Math.sin(rad(c - a) / 2) ** 2 +
    Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function evaluateSignals(policy: unknown, input: SignalInput) {
  const parsed = locationPolicySchema.safeParse(policy);
  const p = parsed.success ? parsed.data : null;
  const coords = coordinatesSchema.safeParse(input.coords);
  const codes: string[] = [];
  if (p && p.mode !== "SIN_VALIDACION") {
    if (["UBICACION_INFORMATIVA", "UBICACION_Y_RED"].includes(p.mode)) {
      if (
        input.coords !== undefined &&
        input.coords !== null &&
        !coords.success
      )
        codes.push("DATOS_DE_UBICACION_INCONSISTENTES");
      else if (!coords.success || coords.data.accuracy > p.maxAccuracyMeters)
        codes.push("UBICACION_NO_VERIFICADA");
      else
        codes.push(
          distanceMeters(
            p.latitude!,
            p.longitude!,
            coords.data.latitude,
            coords.data.longitude,
          ) <= p.radiusMeters!
            ? "DENTRO_DE_SEDE"
            : "FUERA_DE_SEDE",
        );
    }
    if (["RED_INFORMATIVA", "UBICACION_Y_RED"].includes(p.mode))
      codes.push(
        inNetworks(input.clientIp, p.networks)
          ? "RED_RECONOCIDA"
          : "RED_NO_RECONOCIDA",
      );
  }
  return {
    clientIp: normalizeIp(input.clientIp),
    geoLatitude: coords.success ? coords.data.latitude : null,
    geoLongitude: coords.success ? coords.data.longitude : null,
    geoAccuracyMeters: coords.success ? coords.data.accuracy : null,
    locationRiskCode: codes.includes("DATOS_DE_UBICACION_INCONSISTENTES")
      ? "DATOS_DE_UBICACION_INCONSISTENTES"
      : (codes.find((c) =>
          [
            "UBICACION_NO_VERIFICADA",
            "FUERA_DE_SEDE",
            "RED_NO_RECONOCIDA",
          ].includes(c),
        ) ??
        codes[0] ??
        null),
  };
}
export function signalRisk(
  risk: Risk,
  codes: (string | null | undefined)[],
): Risk {
  const reasons = [
    ...new Set([...risk.reasons, ...codes.filter((c): c is string => !!c)]),
  ];
  const red = reasons.includes("DATOS_DE_UBICACION_INCONSISTENTES");
  const yellow = reasons.some((c) =>
    [
      "UBICACION_NO_VERIFICADA",
      "FUERA_DE_SEDE",
      "RED_NO_RECONOCIDA",
      "CAPTURA_CONTINGENCIA",
    ].includes(c),
  );
  return {
    ...risk,
    reasons,
    color:
      red || risk.color === "ROJO"
        ? "ROJO"
        : yellow || risk.color === "AMARILLO"
          ? "AMARILLO"
          : "VERDE",
  };
}
/** Never spread a database attendance row into an API response. */
export function publicAttendance<
  T extends {
    clientIp?: unknown;
    geoLatitude?: unknown;
    geoLongitude?: unknown;
    geoAccuracyMeters?: unknown;
    checkoutSignal?: unknown;
    contingencyJustification?: unknown;
    policySnapshot?: unknown;
  },
>(row: T) {
  const {
    clientIp: _ip,
    geoLatitude: _lat,
    geoLongitude: _lon,
    geoAccuracyMeters: _accuracy,
    checkoutSignal: _exit,
    contingencyJustification: _private,
    policySnapshot: _privatePolicy,
    ...safe
  } = row;
  return safe;
}
