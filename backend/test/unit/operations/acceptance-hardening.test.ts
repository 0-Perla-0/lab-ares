import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import {
  historicalDuty,
  recordOperationalHistory,
} from "../../../src/common/domain/operational-history";
import {
  pilotAllows,
  pilotWhere,
  requirePilot,
} from "../../../src/common/domain/operational-pilot";
import { observeWorker } from "../../../src/common/domain/worker-heartbeat";
import { visitCode, sameVisitCode } from "../../../src/visits/visit-token";
import { validateEnvironment } from "../../../src/config/environment";
import { runtimeGrants } from "../../../src/scripts/provision-runtime-db";
import { suppressOperationalEvidence } from "../../../src/retention/operational-evidence";
import { redactAbsenceReceipt } from "../../../src/retention/operational-evidence";
import { OperationsService } from "../../../src/operations/operations.service";

const key1 = "first-dedicated-visit-key-32-characters";
const key2 = "second-dedicated-visit-key-32-characters";
describe("acceptance hardening", () => {
  it("redacts nested absence narratives but preserves state, version and evidence references", () => {
    expect(
      redactAbsenceReceipt({
        estado: "JUSTIFICADA",
        version: 2,
        motivoResolucion: "private",
        justificaciones: [{ motivo: "private", archivoId: "file" }],
        apelacion: { argumento: "private", resolucion: "private" },
      }),
    ).toEqual({
      estado: "JUSTIFICADA",
      version: 2,
      motivoResolucion: "[SUPRIMIDO]",
      justificaciones: [{ motivo: "[SUPRIMIDO]", archivoId: "file" }],
      apelacion: { argumento: "[SUPRIMIDO]", resolucion: "[SUPRIMIDO]" },
    });
  });
  it("active legal hold is checked under its record lock before evidence suppression", async () => {
    const tx: any = {
      $queryRaw: vi.fn(),
      registroRetencion: {
        findMany: vi.fn().mockResolvedValue([{ id: "held" }]),
      },
      retencionLegal: { count: vi.fn().mockResolvedValue(1) },
      invitacionVisita: { findUnique: vi.fn() },
    };
    await expect(
      suppressOperationalEvidence(
        { $transaction: (run: any) => run(tx) } as any,
        {} as any,
        "VisitEvidence",
        "visit",
      ),
    ).rejects.toMatchObject({ code: "SUPPRESSION_RECORD_LEGAL_HOLD" });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.invitacionVisita.findUnique).not.toHaveBeenCalled();
  });
  it("rotates without replacing the key used by an existing code", () => {
    const old = visitCode("id", "legacy", key1);
    const ring = JSON.stringify({ legacy: key1, v2: key2 });
    expect(visitCode("id", "legacy", key2, ring)).toBe(old);
    expect(visitCode("id", "v2", key1, ring)).not.toBe(old);
    expect(sameVisitCode(old, visitCode("id", "legacy", key1))).toBe(true);
  });
  it("retired versions do not fall back to the current key", () => {
    expect(() =>
      visitCode("id", "legacy", key1, JSON.stringify({ v2: key2 })),
    ).toThrow();
    expect(sameVisitCode("bad", "bad")).toBe(false);
  });
  it.each([
    "not JSON",
    '{"v2":"short"}',
    '{"version with spaces":"abcdefghijklmnopqrstuvwxyz0123456789"}',
  ])("rejects malformed keyring %s", (ring) => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: "mysql://u:p@localhost/test",
        VISITS_TOKEN_KEYRING: ring,
      }),
    ).toThrow();
  });
  it("requires the configured active version in the keyring", () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: "mysql://u:p@localhost/test",
        VISITS_TOKEN_ACTIVE_VERSION: "v3",
        VISITS_TOKEN_KEYRING: JSON.stringify({ v2: key2 }),
      }),
    ).toThrow();
  });
  it("pilot lists intersect rather than expanding permissions", () => {
    const config = new ConfigService({
      OPERATIONAL_PILOT_SEDE_IDS: "1,2",
      OPERATIONAL_PILOT_AREA_IDS: "3",
    });
    expect(pilotWhere(config)).toEqual({
      sedeId: { in: [1, 2] },
      areaId: { in: [3] },
    });
    expect(pilotAllows(config, { sedeId: 1, areaId: 3 })).toBe(true);
    expect(() => requirePilot(config, { sedeId: 2, areaId: 4 })).toThrow();
    expect(pilotAllows(new ConfigService(), { sedeId: null })).toBe(true);
  });
  it("runtime ledger and history accounts have no UPDATE/DELETE, DDL or migration grants", () => {
    const grants = runtimeGrants(
      "ares_test",
      "ares_runtime_test",
      "localhost",
      [
        "MovimientoInventario",
        "OperationalHistory",
        "AuditEvent",
        "Usuario",
        "_prisma_migrations",
      ],
    );
    expect(grants).toHaveLength(4);
    expect(
      grants
        .slice(0, 3)
        .every((sql) => sql.startsWith("GRANT SELECT, INSERT ON")),
    ).toBe(true);
    expect(grants.join(" ")).not.toMatch(
      /ALTER|CREATE|DROP|GRANT OPTION|_prisma_migrations/,
    );
    expect(() =>
      runtimeGrants("db`;DROP", "ares_runtime_test", "%", []),
    ).toThrow();
    expect(() => runtimeGrants("db", "unrelated_user", "%", [])).toThrow();
  });
  it("unknown historical assignments are explicit and never current-user fallbacks", async () => {
    const tx: any = {
      operationalHistory: { findFirst: vi.fn().mockResolvedValue(null) },
      usuario: { findUnique: vi.fn() },
    };
    expect(await historicalDuty(tx, 1, "2026-10-09")).toEqual({
      reason: "ASSIGNMENT_HISTORY_UNKNOWN",
    });
    expect(tx.usuario.findUnique).not.toHaveBeenCalled();
  });
  it("a mid-day assignment change requires review", async () => {
    const tx: any = {
      operationalHistory: {
        findFirst: vi.fn().mockResolvedValue({
          snapshot: {
            rol: "PRESTADOR",
            estado: "ACTIVA",
            sedeId: 1,
            areaId: 2,
            turnoId: 3,
          },
        }),
      },
    };
    expect(await historicalDuty(tx, 1, "2026-10-09")).toEqual({
      reason: "ASSIGNMENT_HISTORY_UNKNOWN",
    });
  });
  it("records only operational assignment fields in the same transaction", async () => {
    const tx: any = {
      usuario: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          rol: "PRESTADOR",
          estado: "ACTIVA",
          sedeId: 1,
          areaId: 2,
          turnoId: 3,
          email: "private",
          passwordHash: "private",
        }),
      },
      operationalHistory: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    };
    await recordOperationalHistory(tx, "USER", 5);
    const snapshot =
      tx.operationalHistory.create.mock.calls[0][0].data.snapshot;
    expect(Object.keys(snapshot).sort()).toEqual([
      "areaId",
      "estado",
      "rol",
      "sedeId",
      "turnoId",
    ]);
  });
  it("suppression refuses open visits, not just elapsed invitation windows", async () => {
    const tx: any = {
      registroRetencion: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn(),
      invitacionVisita: {
        findUnique: vi.fn().mockResolvedValue({
          estado: "REGISTRADA_ENTRADA",
          validaHasta: new Date(0),
        }),
        update: vi.fn(),
      },
    };
    const db: any = { $transaction: (run: any) => run(tx) };
    await expect(
      suppressOperationalEvidence(db, {} as any, "VisitEvidence", "id"),
    ).rejects.toMatchObject({ code: "RETENTION_RESOURCE_NOT_TERMINAL" });
    expect(tx.invitacionVisita.update).not.toHaveBeenCalled();
  });
  it("recovery freeze stops the scheduler and telemetry writes", async () => {
    const tx: any = {
      $queryRaw: vi.fn(),
      recoveryWriteBarrier: {
        findUnique: vi.fn().mockResolvedValue({ active: true }),
      },
      workerHeartbeat: { upsert: vi.fn() },
    };
    const db: any = { $transaction: (run: any) => run(tx) };
    const run = vi.fn();
    await observeWorker(db, "storage", run);
    expect(run).not.toHaveBeenCalled();
    expect(tx.workerHeartbeat.upsert).not.toHaveBeenCalled();
  });
  it("failed scheduler cycles keep only a redacted error code", async () => {
    const tx: any = {
      $queryRaw: vi.fn(),
      recoveryWriteBarrier: {
        findUnique: vi.fn().mockResolvedValue({ active: false }),
      },
      workerHeartbeat: { upsert: vi.fn() },
    };
    const db: any = { $transaction: (run: any) => run(tx) };
    await observeWorker(db, "storage", async () => {
      throw new Error("password=private");
    });
    expect(JSON.stringify(tx.workerHeartbeat.upsert.mock.calls)).not.toContain(
      "password",
    );
    expect(
      tx.workerHeartbeat.upsert.mock.calls.at(-1)[0].update.errorCode,
    ).toBe("WORKER_CYCLE_FAILED");
  });
  it("SMTP connectivity does not assert delivery and missing heartbeat remains absent", async () => {
    const db: any = {
      operationalJobExecution: { groupBy: vi.fn().mockResolvedValue([]) },
      operationalAlert: { count: vi.fn().mockResolvedValue(0) },
      operationalIncident: { count: vi.fn().mockResolvedValue(0) },
      workerHeartbeat: { findMany: vi.fn().mockResolvedValue([]) },
      absenceEvaluationIssue: { count: vi.fn().mockResolvedValue(2) },
    };
    const result = await new OperationsService(
      db,
      {} as any,
      { dependencies: async () => ({ database: "connected" }) } as any,
      new ConfigService() as any,
      undefined,
      { connectivity: async () => "connected" } as any,
    ).status();
    expect(result.smtp).toMatchObject({
      connectivity: "connected",
      deliveryVerified: false,
    });
    expect(result.workerHealth).toEqual({});
    expect(result.absenceEvaluationIssues).toBe(2);
  });
});
