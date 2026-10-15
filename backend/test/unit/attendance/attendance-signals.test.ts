import { describe, expect, it } from "vitest";
import {
  clientIp,
  distanceMeters,
  evaluateSignals,
  inNetworks,
  locationPolicySchema,
  publicAttendance,
  signalRisk,
  validCidr,
} from "../../../src/attendance/attendance-signals";
import {
  checkInSchema,
  checkOutSchema,
} from "../../../src/attendance/attendance.schemas";
const location = locationPolicySchema.parse({
  mode: "UBICACION_Y_RED",
  latitude: 19.4,
  longitude: -99.1,
  radiusMeters: 100,
  networks: ["10.20.0.0/16", "2001:db8::/32"],
});
describe("advisory location/network evidence", () => {
  it.each(["127.0.0.1/32", "::1/128", "0.0.0.0/0", "2001:db8::/32"])(
    "accepts CIDR %s",
    (cidr) => expect(validCidr(cidr)).toBe(true),
  );
  it.each([
    "127.0.0.1",
    "1.2.3.4/33",
    "::1/129",
    "bad/8",
    "1.2.3.4/-1",
    "1.2.3.4/8/0",
  ])("rejects CIDR %s", (cidr) => expect(validCidr(cidr)).toBe(false));
  it("never trusts forwarded headers from an untrusted socket", () =>
    expect(clientIp("192.0.2.1", "10.20.1.1", ["127.0.0.1/32"])).toBe(
      "192.0.2.1",
    ));
  it("stops at the first untrusted hop, ignoring spoofed entries to its left", () =>
    expect(
      clientIp("127.0.0.1", "10.20.1.1, 192.0.2.1, 127.0.0.2", ["127.0.0.0/8"]),
    ).toBe("192.0.2.1"));
  it("sanitizes malformed forwarded chains by falling back to socket", () =>
    expect(
      clientIp("::ffff:127.0.0.1", "10.20.1.1, bad", ["127.0.0.1/32"]),
    ).toBe("127.0.0.1"));
  it("handles IPv6 CIDRs", () => {
    expect(inNetworks("2001:db8::9", location.networks)).toBe(true);
    expect(inNetworks("2001:db9::9", location.networks)).toBe(false);
  });
  it("has stable zero and far distances", () => {
    expect(distanceMeters(19.4, -99.1, 19.4, -99.1)).toBe(0);
    expect(distanceMeters(19.4, -99.1, 20.4, -99.1)).toBeGreaterThan(100000);
  });
  it("missing permissions/location remain accepted attendance payloads", () => {
    expect(checkInSchema.parse({})).toEqual({});
    expect(checkOutSchema.parse({ attendanceId: 1 })).toEqual({
      attendanceId: 1,
    });
    expect(evaluateSignals(location, {}).locationRiskCode).toBe(
      "UBICACION_NO_VERIFICADA",
    );
  });
  it.each([
    { latitude: 200, longitude: 0, accuracy: 1 },
    { latitude: 0 },
    "bad",
  ])(
    "malformed evidence is red but does not fail body validation",
    (coords) => {
      expect(checkInSchema.safeParse({ coords }).success).toBe(true);
      expect(evaluateSignals(location, { coords }).locationRiskCode).toBe(
        "DATOS_DE_UBICACION_INCONSISTENTES",
      );
    },
  );
  it("validates accuracy and geofence, with no client-side success authority", () => {
    expect(
      evaluateSignals(location, {
        coords: { latitude: 19.4, longitude: -99.1, accuracy: 5 },
        clientIp: "10.20.1.1",
      }).locationRiskCode,
    ).toBe("DENTRO_DE_SEDE");
    expect(
      evaluateSignals(location, {
        coords: { latitude: 19.4, longitude: -99.1, accuracy: 500 },
        clientIp: "10.20.1.1",
      }).locationRiskCode,
    ).toBe("UBICACION_NO_VERIFICADA");
    expect(
      evaluateSignals(location, {
        coords: { latitude: 20.4, longitude: -99.1, accuracy: 5 },
      }).locationRiskCode,
    ).toBe("FUERA_DE_SEDE");
  });
  it("network mismatch cannot be masked by valid location", () =>
    expect(
      evaluateSignals(location, {
        coords: { latitude: 19.4, longitude: -99.1, accuracy: 5 },
        clientIp: "192.0.2.1",
      }).locationRiskCode,
    ).toBe("RED_NO_RECONOCIDA"));
  it("disabled policy does not create advisory risk", () =>
    expect(
      evaluateSignals({ mode: "SIN_VALIDACION" }, { coords: "bad" })
        .locationRiskCode,
    ).toBeNull());
  it("merges risks without downgrading red", () => {
    expect(
      signalRisk({ color: "ROJO", reasons: ["X"], policyVersion: 2 }, [
        "DENTRO_DE_SEDE",
      ]).color,
    ).toBe("ROJO");
    expect(
      signalRisk({ color: "VERDE", reasons: [], policyVersion: 2 }, [
        "RED_NO_RECONOCIDA",
      ]).color,
    ).toBe("AMARILLO");
  });
  it("redacts all private evidence from ordinary responses", () =>
    expect(
      publicAttendance({
        id: 1,
        clientIp: "private-ip",
        geoLatitude: 10,
        geoLongitude: 10,
        geoAccuracyMeters: 5,
        checkoutSignal: { clientIp: "private-exit" },
        contingencyJustification: "private-ticket-narrative",
        locationRiskCode: "DENTRO_DE_SEDE",
      }),
    ).toEqual({ id: 1, locationRiskCode: "DENTRO_DE_SEDE" }));
  it("rejects incomplete policy publications rather than silently enabling checks", () => {
    expect(
      locationPolicySchema.safeParse({ mode: "UBICACION_INFORMATIVA" }).success,
    ).toBe(false);
    expect(
      locationPolicySchema.safeParse({ mode: "RED_INFORMATIVA", networks: [] })
        .success,
    ).toBe(false);
  });
});
