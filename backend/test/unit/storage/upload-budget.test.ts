import { describe, expect, it } from "vitest";
import { UploadBudget } from "../../../src/storage/upload-budget";
describe("replica-local private upload admission", () => {
  it("holds capacity until explicit domain/parser cleanup and tolerates repeated cleanup", () => {
    const budget = new UploadBudget();
    const first = budget.reserve(2),
      second = budget.reserve(2);
    expect(() => budget.reserve(2)).toThrow();
    budget.release(first);
    const replacement = budget.reserve(2);
    budget.release(first);
    expect(() => budget.reserve(2)).toThrow();
    budget.release(second);
    budget.release(replacement);
    expect(() => budget.reserve(2)).not.toThrow();
  });
  it.each([0, 33, 1.5, Number.NaN])("rejects invalid ceilings %s", (limit) => {
    expect(() => new UploadBudget().reserve(limit)).toThrow(
      "Invalid upload concurrency",
    );
  });
});
