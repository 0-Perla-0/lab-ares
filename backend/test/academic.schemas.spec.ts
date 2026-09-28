import { describe, expect, it } from "vitest";
import { strictProfileSchema, confirmSchema } from "../src/academic/academic.schemas";
describe("academic schemas", () => {
  it("rejects impossible calendar dates and accepts date-only", () => { expect(strictProfileSchema.safeParse({ institucionId: 1, programaAcademicoId: 2, inicio: "2024-02-30" }).success).toBe(false); expect(strictProfileSchema.safeParse({ institucionId: 1, programaAcademicoId: 2, inicio: "2024-02-29" }).success).toBe(true); });
  it("requires a rejection reason", () => { expect(confirmSchema.safeParse({ accept: false }).success).toBe(false); expect(confirmSchema.safeParse({ accept: false, motivo: "No coincide" }).success).toBe(true); });
  it("rejects timezone-bearing dates", () => { expect(strictProfileSchema.safeParse({ institucionId: 1, programaAcademicoId: 2, inicio: "2024-02-29T00:00:00Z" }).success).toBe(false); });
  it("requires boolean confirmation", () => { expect(confirmSchema.safeParse({ accept: "true" }).success).toBe(false); });
  it("limits confirmation reason", () => { expect(confirmSchema.safeParse({ accept: false, motivo: "x".repeat(501) }).success).toBe(false); });
  it("rejects invalid month/day", () => { expect(strictProfileSchema.safeParse({ institucionId: 1, programaAcademicoId: 2, inicio: "2024-13-01" }).success).toBe(false); expect(strictProfileSchema.safeParse({ institucionId: 1, programaAcademicoId: 2, inicio: "2024-04-31" }).success).toBe(false); });
});
