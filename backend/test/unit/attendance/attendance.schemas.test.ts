import { describe, expect, it } from "vitest";

import {
  idempotencyKeySchema,
  registrarAsistenciaSchema,
} from "../../../src/attendance/attendance.schemas";

describe("attendance schemas", () => {
  it("accepts an omitted body and optional consented coordinates", () => {
    expect(registrarAsistenciaSchema.parse(undefined)).toEqual({});
    expect(
      registrarAsistenciaSchema.parse({
        ubicacion: {
          latitud: 19.4326,
          longitud: -99.1332,
          precisionMetros: 12.5,
        },
      }),
    ).toEqual({
      ubicacion: {
        latitud: 19.4326,
        longitud: -99.1332,
        precisionMetros: 12.5,
      },
    });
  });

  it("rejects incomplete, out-of-range or additional location data", () => {
    expect(() =>
      registrarAsistenciaSchema.parse({
        ubicacion: { latitud: 91, longitud: -99, precisionMetros: 5 },
      }),
    ).toThrow();
    expect(() =>
      registrarAsistenciaSchema.parse({
        ubicacion: { latitud: 19, longitud: -99 },
      }),
    ).toThrow();
    expect(() =>
      registrarAsistenciaSchema.parse({ clientTime: 123 }),
    ).toThrow();
  });

  it("requires a bounded and transport-safe idempotency key", () => {
    expect(
      idempotencyKeySchema.parse(" 550e8400-e29b-41d4-a716-446655440000 "),
    ).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(() => idempotencyKeySchema.parse("short")).toThrow();
    expect(() =>
      idempotencyKeySchema.parse("key with whitespace is invalid"),
    ).toThrow();
  });
});
