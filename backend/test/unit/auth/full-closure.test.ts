import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  operationalNotification,
  notificationLink,
} from "../../../src/common/domain/operational-notification";
import {
  RecentAuthGuard,
  RECENT_AUTH_MS,
} from "../../../src/auth/recent-auth.guard";
import { Permission } from "../../../src/auth/permissions";
import { validatePasswordPolicy } from "../../../src/auth/password";
import { FeaturePoliciesService } from "../../../src/common/domain/feature-policies.service";
import { UsersPolicy } from "../../../src/users/users.policy";
import { administrativeRecoverySchema } from "../../../src/users/administrative-recovery.service";
import { AuthController } from "../../../src/auth/auth.controller";
import { InvalidCredentialsError } from "../../../src/auth/auth.service";

const actor: any = {
  id: 1,
  rol: "ADMIN",
  estado: "ACTIVA",
  areaId: 2,
  sedeId: 3,
};
afterEach(() => vi.unstubAllEnvs());
describe("full closure security and communication boundaries", () => {
  it.each(["password", "totp", "recovery"])(
    "never assigns an authenticated session when final account verification fails (%s)",
    async (factor) => {
      const request: any = { session: { regenerate: vi.fn(), save: vi.fn() } };
      const auth: any = {
        authenticate: vi.fn().mockResolvedValue(actor),
        completedAuthentication: vi
          .fn()
          .mockRejectedValue(new InvalidCredentialsError()),
      };
      const mfa: any = {
        status: vi.fn().mockResolvedValue({ enabled: false }),
        consumeChallenge: vi.fn().mockResolvedValue(actor.id),
      };
      const controller = new AuthController(auth, {} as any, mfa);
      const attempt =
        factor === "password"
          ? controller.login(
              { email: "test@example.test", password: "synthetic-password" },
              request,
            )
          : factor === "totp"
            ? controller.mfaVerify(
                { challenge: "synthetic", code: "123456" },
                request,
              )
            : controller.mfaRecovery(
                { challenge: "synthetic", code: "recovery" },
                request,
              );
      await expect(attempt).rejects.toBeDefined();
      expect(request.session).not.toHaveProperty("userId");
      expect(request.session).not.toHaveProperty("authenticatedAt");
      expect(request.session.regenerate).not.toHaveBeenCalled();
      expect(request.session.save).not.toHaveBeenCalled();
    },
  );
  it("writes both records in the supplied transaction and keeps private narratives out of outbox", async () => {
    const tx: any = {
      notification: { create: vi.fn().mockResolvedValue({ id: "notice" }) },
      outboxEvent: { create: vi.fn() },
    };
    await operationalNotification(tx, 1, "ABSENCE_RESOLVED", {
      ausenciaId: "absence-fixture",
      estado: "JUSTIFICADA",
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        type: "OPERATIONAL_NOTIFICATION",
        aggregateId: "notice",
        payload: { notificationId: "notice" },
      },
    });
    expect(JSON.stringify(tx.outboxEvent.create.mock.calls)).not.toContain(
      "private narrative",
    );
  });
  it("does not swallow an outbox error", async () => {
    const tx: any = {
      notification: { create: vi.fn().mockResolvedValue({ id: "n" }) },
      outboxEvent: { create: vi.fn().mockRejectedValue(new Error("rollback")) },
    };
    await expect(
      operationalNotification(tx, 1, "MFA_ENABLED", { enabled: true }),
    ).rejects.toThrow("rollback");
  });
  it.each([
    ["ABSENCE_PROVISIONAL_CREATED", "/portal/asistencia/ausencias"],
    ["ATTENDANCE_DAILY_CUTOFF", "/portal/asistencia"],
    ["MFA_RECOVERY_CODE_USED", "/portal/seguridad"],
  ])("uses private portal links for %s", (type, link) =>
    expect(notificationLink(type)).toBe(link),
  );
  function guard(
    at: number | undefined,
    enabled = false,
    factor = "password",
    method = "POST",
  ) {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === "permissions" ? [Permission.USERS_MANAGE] : undefined,
      ),
    };
    const db: any = {
      userMfa: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ enabledAt: enabled ? new Date() : null }),
      },
    };
    const context: any = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          user: actor,
          session: { authenticatedAt: at, authenticationFactor: factor },
        }),
      }),
    };
    return new RecentAuthGuard(
      reflector as unknown as Reflector,
      db,
    ).canActivate(context);
  }
  it("allows a recent password confirmation without requiring MFA enrollment", async () =>
    expect(await guard(Date.now())).toBe(true));
  it("requires a recent second factor when MFA is active", async () => {
    await expect(guard(Date.now(), true)).rejects.toMatchObject({
      code: "REAUTH_REQUIRED",
    });
    expect(await guard(Date.now(), true, "mfa")).toBe(true);
  });
  it.each([undefined, Date.now() - RECENT_AUTH_MS, Date.now() + 100000])(
    "rejects missing, expired and future timestamps (%s)",
    async (at) =>
      await expect(guard(at)).rejects.toMatchObject({
        code: "REAUTH_REQUIRED",
      }),
  );
  it("keeps authorized reads available without fresh confirmation", async () =>
    expect(await guard(undefined, false, "password", "GET")).toBe(true));
  it.each([
    "abcdefghijklmnop",
    "9876543210987654",
    "abcdabcdabcdabcd",
    "ares123456789012345",
  ])("screens sequences and obvious patterns (%s)", (password) =>
    expect(() => validatePasswordPolicy(password)).toThrow(),
  );
  it("screens identity-equivalent passwords and a reviewed offline denylist", () => {
    const password = "identity@example.test";
    expect(() =>
      validatePasswordPolicy(password, { email: password }),
    ).toThrow();
    vi.stubEnv(
      "PASSWORD_DENY_SHA256",
      createHash("sha256").update("Known leaked phrase 2026").digest("hex"),
    );
    expect(() => validatePasswordPolicy("Known leaked phrase 2026")).toThrow();
    expect(() =>
      validatePasswordPolicy("Mi frase única y suficientemente larga"),
    ).not.toThrow();
  });
  it("cannot recover its own identity or recover across scope", () => {
    const policy = new UsersPolicy({} as any);
    expect(() => policy.requireRecovery(actor, { ...actor })).toThrow();
    expect(() =>
      policy.requireRecovery(
        { ...actor, rol: "JEFE_AREA" },
        { id: 4, rol: "PRESTADOR", areaId: 99, sedeId: 3 },
      ),
    ).toThrow();
    expect(() =>
      policy.requireRecovery(actor, {
        id: 4,
        rol: "PRESTADOR",
        areaId: 99,
        sedeId: 3,
      }),
    ).not.toThrow();
  });
  it("requires explicit institutional verification and never accepts a password override", () => {
    const input = { ticket: "TKT-1", reason: "Identity verified by authority" };
    expect(administrativeRecoverySchema.safeParse(input).success).toBe(false);
    expect(
      administrativeRecoverySchema.safeParse({
        ...input,
        identityVerified: true,
        password: "bad override",
      }).success,
    ).toBe(false);
  });
  it("intersects flags with environment ceilings, module, function, placement and user", async () => {
    const policy = {
      module: "VISITS.REQUEST",
      enabled: true,
      sedeIds: [3],
      areaIds: [2],
      userIds: [1],
    };
    const db: any = {
      featurePolicy: { findMany: vi.fn().mockResolvedValue([policy]) },
    };
    const service = new FeaturePoliciesService(
      db,
      new ConfigService({ VISITS_ENABLED: true }),
    );
    expect((await service.capabilities(actor))["VISITS.REQUEST"]).toBe(true);
    expect(
      (await service.capabilities({ ...actor, id: 2 }))["VISITS.REQUEST"],
    ).toBe(false);
    expect(
      (
        await new FeaturePoliciesService(
          db,
          new ConfigService({ VISITS_ENABLED: false }),
        ).capabilities(actor)
      )["VISITS.REQUEST"],
    ).toBe(false);
    db.featurePolicy.findMany.mockResolvedValue([
      policy,
      { ...policy, module: "VISITS", enabled: false },
    ]);
    expect((await service.capabilities(actor))["VISITS.REQUEST"]).toBe(false);
  });
});
