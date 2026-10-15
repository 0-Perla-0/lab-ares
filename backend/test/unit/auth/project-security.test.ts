import { describe, expect, it, vi } from "vitest";
import { jsonSafe } from "../../../src/common/http/json-safe.interceptor";
import { validatePasswordPolicy } from "../../../src/auth/password";
import { base32Secret, MfaService } from "../../../src/auth/mfa.service";
import { validateEnvironment } from "../../../src/config/environment";
import { InvitationsController } from "../../../src/invitations/invitations.controller";
import { IS_PUBLIC_KEY } from "../../../src/auth/public.decorator";

describe("project security regressions", () => {
  it("does not traverse Express response or stream instances", () => {
    class Response {
      self: unknown = this;
    }
    const response = new Response();
    expect(jsonSafe(response)).toBe(response);
  });
  it("serializes nested Prisma BigInt without losing large integers", () => {
    expect(
      JSON.stringify(
        jsonSafe({ file: { sizeBytes: 25n }, large: 9007199254740993n }),
      ),
    ).toBe('{"file":{"sizeBytes":25},"large":"9007199254740993"}');
  });
  it("rejects common and repetitive passwords while accepting passphrases", () => {
    expect(() => validatePasswordPolicy("123456789012345")).toThrow();
    expect(() => validatePasswordPolicy("a".repeat(80))).toThrow();
    expect(() =>
      validatePasswordPolicy("Mi frase de contraseña 🛡️ larga"),
    ).not.toThrow();
  });
  it("encodes the standard RFC6238 secret as Base32 for authenticators", () => {
    expect(
      base32Secret(Buffer.from("12345678901234567890").toString("base64url")),
    ).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });
  it.each([
    "STORAGE_SCANNER_ENABLED",
    "STORAGE_WORKER_ENABLED",
    "STORAGE_RECONCILER_ENABLED",
    "REPORTS_WORKER_ENABLED",
    "SMTP_ENABLED",
    "OUTBOX_WORKER_ENABLED",
    "SMTP_TLS",
  ])("parses %s=false as false", (key) => {
    expect(
      validateEnvironment({
        DATABASE_URL: "mysql://u:p@localhost/test",
        [key]: "false",
      })[key as keyof ReturnType<typeof validateEnvironment>],
    ).toBe(false);
  });
  it("marks only token lookup and acceptance as public", () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, InvitationsController.prototype.get),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        InvitationsController.prototype.accept,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, InvitationsController.prototype.list),
    ).toBeUndefined();
  });
  it("waits for invitation responses instead of embedding promises", async () => {
    const service = { get: vi.fn().mockResolvedValue({ id: "inv-1" }) };
    const result = await new InvitationsController(service as never).get(
      "token",
    );
    expect(result).toEqual({ data: { id: "inv-1" } });
  });
  it("does not replace an active MFA configuration", async () => {
    const tx = {
      $executeRaw: vi.fn(),
      userMfa: {
        findUnique: vi.fn().mockResolvedValue({ enabledAt: new Date() }),
        upsert: vi.fn(),
      },
    };
    const prisma = {
      usuario: {
        findUnique: vi.fn().mockResolvedValue({ passwordHash: "hash" }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ email: "self@test.local" }),
      },
      $transaction: (fn: (client: unknown) => unknown) => fn(tx),
    };
    const service = new MfaService(
      prisma as never,
      { get: () => "test-mfa-encryption-key-32-characters" } as never,
    );
    vi.spyOn(service as any, "assertPassword").mockResolvedValue(undefined);
    await expect(service.setup(1, "password")).rejects.toMatchObject({
      code: "MFA_ALREADY_ENABLED",
    });
    expect(tx.userMfa.upsert).not.toHaveBeenCalled();
  });
});
