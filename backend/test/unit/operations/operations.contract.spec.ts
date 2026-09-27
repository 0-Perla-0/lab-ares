import { describe, expect, it } from "vitest";

import {
  AccessScope,
  getAccessScope,
  Permission,
} from "../../../src/auth/permissions";
import { RolUsuario } from "../../../src/generated/prisma/enums";
import { createOpenApiDocument } from "../../../src/openapi/openapi.document";
import {
  createJobSchema,
  updateIncidentSchema,
} from "../../../src/operations/operations.schemas";

const user = (rol: RolUsuario) => ({
  id: 1,
  codigo: "USR001",
  email: "user@example.com",
  rol,
  estado: "ACTIVA" as const,
  sedeId: 1,
  areaId: 1,
  turnoId: null,
});

describe("operations contracts", () => {
  it("exposes every private audit and operations route without mutable audit endpoints", () => {
    const paths = createOpenApiDocument().paths as Record<string, unknown>;
    for (const path of [
      "/api/audit/me",
      "/api/audit/events",
      "/api/audit/export",
      "/api/audit/manifests/{period}",
      "/api/audit/manifests/{period}/verify",
      "/api/operations/status",
      "/api/operations/jobs",
      "/api/operations/alerts",
      "/api/operations/incidents",
    ])
      expect(paths).toHaveProperty(path);
    expect(paths).not.toHaveProperty("/api/audit/events/{id}");
  });

  it("keeps self audit universal, audit queries scoped, and operations global", () => {
    expect(
      getAccessScope(
        user(RolUsuario.PRESTADOR) as any,
        Permission.AUDIT_SELF_READ,
      ),
    ).toBe(AccessScope.SELF);
    expect(
      getAccessScope(user(RolUsuario.JEFE_AREA) as any, Permission.AUDIT_READ),
    ).toBe(AccessScope.AREA);
    expect(
      getAccessScope(
        user(RolUsuario.JEFE_AREA) as any,
        Permission.OPERATIONS_READ,
      ),
    ).toBeNull();
    expect(
      getAccessScope(
        user(RolUsuario.JEFE_COORDINADORES) as any,
        Permission.OPERATIONS_READ,
      ),
    ).toBe(AccessScope.GLOBAL);
  });

  it("rejects secret-bearing jobs and incomplete incident transitions", () => {
    expect(() =>
      createJobSchema.parse({
        name: "unsafe",
        idempotencyKey: "unsafe-job-key",
        payload: { nested: { accessToken: "value" } },
      }),
    ).toThrow();
    expect(() =>
      updateIncidentSchema.parse({
        state: "RESUELTO",
        reason: "Resolved after mitigation",
      }),
    ).toThrow();
    expect(
      updateIncidentSchema.parse({
        state: "RESUELTO",
        ownerId: 1,
        reason: "Resolved after mitigation",
      }).state,
    ).toBe("RESUELTO");
  });
});
