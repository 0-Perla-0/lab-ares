import { describe, expect, it } from "vitest";
import { totpCode } from "../src/auth/mfa.service";
describe("MFA RFC6238", () => { it("is deterministic", () => { expect(totpCode("GEZDGNBVGY3TQOJQ", 1)).toBe("220540"); }); it("changes across time steps", () => { expect(totpCode("GEZDGNBVGY3TQOJQ", 1)).not.toBe(totpCode("GEZDGNBVGY3TQOJQ", 2)); }); });
