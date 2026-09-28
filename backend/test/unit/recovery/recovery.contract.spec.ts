import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AccessScope,
  getAccessScope,
  Permission,
} from "../../../src/auth/permissions";
import { RolUsuario } from "../../../src/generated/prisma/enums";
import { createOpenApiDocument } from "../../../src/openapi/openapi.document";
import {
  createRecoveryRunSchema,
  recordRestoreSchema,
  recoveryIdempotencyKeySchema,
} from "../../../src/recovery/recovery.schemas";

const user = (rol: RolUsuario) =>
  ({
    id: 1,
    codigo: "USR001",
    email: "user@example.com",
    rol,
    estado: "ACTIVO",
    sedeId: 1,
    areaId: 1,
    turnoId: null,
  }) as any;

describe("recovery contracts", () => {
  it("publishes the complete governed recovery sequence", () => {
    const paths = createOpenApiDocument().paths as Record<string, unknown>;
    for (const path of [
      "/api/recovery/status",
      "/api/recovery",
      "/api/recovery/{id}",
      "/api/recovery/{id}/freeze",
      "/api/recovery/{id}/restore",
      "/api/recovery/{id}/reconciliation/preview",
      "/api/recovery/{id}/reconciliation/execute",
      "/api/recovery/{id}/audit/verify",
      "/api/recovery/{id}/journal/import",
      "/api/recovery/{id}/suppressions/reapply",
      "/api/recovery/{id}/approve-ready",
      "/api/recovery/{id}/unfreeze",
      "/api/recovery/{id}/complete",
      "/api/recovery/{id}/fail",
      "/api/recovery/{id}/cancel",
      "/api/recovery/drills",
    ])
      expect(paths).toHaveProperty(path);
  });

  it("keeps recovery permissions GLOBAL and unavailable to area roles", () => {
    expect(
      getAccessScope(user(RolUsuario.JEFE_AREA), Permission.RECOVERY_READ),
    ).toBeNull();
    expect(
      getAccessScope(
        user(RolUsuario.JEFE_COORDINADORES),
        Permission.RECOVERY_EXECUTE,
      ),
    ).toBe(AccessScope.GLOBAL);
    expect(
      getAccessScope(user(RolUsuario.ADMIN), Permission.RECOVERY_MANAGE),
    ).toBe(AccessScope.GLOBAL);
  });

  it("rejects weak idempotency keys and secret-bearing provider references", () => {
    expect(() => recoveryIdempotencyKeySchema.parse("short")).toThrow();
    expect(() =>
      recordRestoreSchema.parse({
        restorePoint: "2026-09-27T00:00:00.000Z",
        imageVersion: "mariadb-image-42",
        externalProviderRef: "token=must-not-enter-audit",
      }),
    ).toThrow();
    expect(
      createRecoveryRunSchema.parse({
        name: "Quarterly drill",
        scope: "IMPORTANTE",
        responsibleId: 2,
      }).isDrill,
    ).toBe(false);
  });

  it("ships durable barrier and journal bootstrap rows in the migration", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260927020000_recovery_reconciliation/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE `RecoveryWriteBarrier`");
    expect(sql).toContain("CREATE TABLE `SuppressionJournalEntry`");
    expect(sql).toContain("VALUES ('global', false, 0");
    expect(sql).toContain("VALUES ('global', 0");
  });
});
