import { describe, expect, it } from "vitest";

import {
  attendanceQuerySchema,
  checkInSchema,
  idempotencyKeySchema,
  manualCloseSchema,
} from "../../../src/attendance/attendance.schemas";

describe("attendance schemas", () => {
  it("rejects client supplied check-in fields, including time and user", () => {
    expect(checkInSchema.safeParse({}).success).toBe(true);
    for (const value of [
      { usuarioId: 2 },
      { userId: 2 },
      { fechaHora: "2026-01-01T10:00:00Z" },
      { horaEntrada: "10:00" },
    ]) {
      expect(checkInSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts only valid idempotency keys", () => {
    expect(idempotencyKeySchema.safeParse("a".repeat(16)).success).toBe(true);
    for (const value of [
      "short",
      "a".repeat(101),
      "invalid key",
      "á".repeat(16),
    ]) {
      expect(idempotencyKeySchema.safeParse(value).success).toBe(false);
    }
  });

  it("requires a trimmed manual close reason of five to five hundred characters", () => {
    expect(manualCloseSchema.safeParse({ reason: "  válido  " }).success).toBe(
      true,
    );
    for (const reason of ["", "   ", "abcd", "a".repeat(501)]) {
      expect(manualCloseSchema.safeParse({ reason }).success).toBe(false);
    }
  });

  it("rejects pagination outside positive integer bounds", () => {
    expect(attendanceQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(attendanceQuerySchema.parse({ cursor: "4", limit: "100" })).toEqual({
      cursor: 4,
      limit: 100,
    });
    for (const value of [
      { cursor: 0 },
      { cursor: -1 },
      { cursor: 1.5 },
      { limit: 0 },
      { limit: 101 },
      { limit: 1.5 },
    ]) {
      expect(attendanceQuerySchema.safeParse(value).success).toBe(false);
    }
  });
});
