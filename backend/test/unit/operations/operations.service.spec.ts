import { describe, expect, it, vi } from "vitest";

import { OperationsService } from "../../../src/operations/operations.service";
import {
  createIncidentSchema,
  createJobSchema,
} from "../../../src/operations/operations.schemas";
import {
  OperationalJobState,
  RolUsuario,
} from "../../../src/generated/prisma/enums";

const actor = {
  id: 1,
  codigo: "ADMIN001",
  email: "admin@example.com",
  rol: RolUsuario.ADMIN,
  estado: "ACTIVA" as const,
  sedeId: 1,
  areaId: 1,
  turnoId: null,
};

function config() {
  return {
    get: (key: string) =>
      ({
        OPERATIONS_JOB_MAX_ATTEMPTS: 3,
        OPERATIONS_JOB_LEASE_MS: 120_000,
        OPERATIONS_RETRY_BASE_MS: 1_000,
      })[key],
  };
}

describe("operations service", () => {
  it("creates jobs idempotently and claims them with a durable attempt and audit", async () => {
    const job: any = {
      id: "job-1",
      name: "daily-integrity",
      state: OperationalJobState.PENDING,
      attempts: 0,
      maxAttempts: 3,
      leaseUntil: null,
      startedAt: null,
    };
    const upsert = vi.fn(async ({ create }: any) => ({
      id: "job-1",
      state: "PENDING",
      ...create,
    }));
    const tx: any = {
      operationalJobExecution: {
        upsert,
        findFirst: vi.fn(async () => job),
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: vi.fn(async () => ({ ...job, state: "RUNNING" })),
      },
      operationalJobAttempt: {
        create: vi.fn(async () => ({})),
        updateMany: vi.fn(),
      },
      auditEvent: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({})),
      },
    };
    const prisma: any = {
      $transaction: (callback: any) => callback(tx),
    };
    const audit = { append: vi.fn(async () => ({})) };
    const service = new OperationsService(
      prisma,
      audit as any,
      {} as any,
      config() as any,
    );
    const request = createJobSchema.parse({
      name: "daily-integrity",
      idempotencyKey: "period:2026-09-26",
    });
    await service.createJob(request);
    await service.createJob(request);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1][0]).toMatchObject({
      where: { idempotencyKey: "period:2026-09-26" },
      update: {},
    });

    await service.claimJob("job-1", { owner: "worker-a" });
    expect(tx.operationalJobExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: OperationalJobState.RUNNING,
          attempts: 1,
          leaseOwner: "worker-a",
        }),
      }),
    );
    expect(tx.operationalJobAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ executionId: "job-1", number: 1 }),
    });
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "SYSTEM", action: "JOB_CLAIM" }),
      tx,
    );
  });

  it("schedules retry, emits a terminal alert, and records a system failure", async () => {
    const future = new Date(Date.now() + 60_000);
    const job: any = {
      id: "job-1",
      name: "daily-integrity",
      state: OperationalJobState.RUNNING,
      attempts: 3,
      maxAttempts: 3,
      leaseOwner: "worker-a",
      leaseUntil: future,
    };
    const tx: any = {
      operationalJobExecution: {
        findUnique: vi.fn(async () => job),
        updateMany: vi.fn(async ({ data }: any) => {
          Object.assign(job, data);
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn(async () => job),
      },
      operationalJobAttempt: { updateMany: vi.fn(async () => ({ count: 1 })) },
      operationalAlert: { create: vi.fn(async () => ({})) },
    };
    const audit = { append: vi.fn(async () => ({})) };
    const service = new OperationsService(
      { $transaction: (callback: any) => callback(tx) } as any,
      audit as any,
      {} as any,
      config() as any,
    );
    const failed = await service.failJob("job-1", {
      owner: "worker-a",
      errorCode: "DEPENDENCY_TIMEOUT",
    });
    expect(failed.state).toBe(OperationalJobState.FAILED);
    expect(tx.operationalAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        severity: "S2",
        jobExecutionId: "job-1",
      }),
    });
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "SYSTEM", result: "FAILED" }),
      tx,
    );
  });

  it("uses exponential retry before exhausting attempts", async () => {
    const job: any = {
      id: "job-2",
      name: "daily-integrity",
      state: OperationalJobState.RUNNING,
      attempts: 1,
      maxAttempts: 3,
      leaseOwner: "worker-a",
      leaseUntil: new Date(Date.now() + 60_000),
    };
    const tx: any = {
      operationalJobExecution: {
        findUnique: vi.fn(async () => job),
        updateMany: vi.fn(async ({ data }: any) => {
          Object.assign(job, data);
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn(async () => job),
      },
      operationalJobAttempt: { updateMany: vi.fn(async () => ({ count: 1 })) },
      operationalAlert: { create: vi.fn(async () => ({})) },
    };
    const service = new OperationsService(
      { $transaction: (callback: any) => callback(tx) } as any,
      { append: vi.fn(async () => ({})) } as any,
      {} as any,
      config() as any,
    );
    const result = await service.failJob("job-2", {
      owner: "worker-a",
      errorCode: "TEMPORARY",
    });
    expect(result.state).toBe(OperationalJobState.RETRY_SCHEDULED);
    expect(tx.operationalAlert.create).not.toHaveBeenCalled();
    expect(result.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("acknowledges and resolves alerts with the human actor", async () => {
    let alert: any = { id: "alert-1", state: "OPEN" };
    const tx: any = {
      operationalAlert: {
        findUnique: vi.fn(async () => alert),
        updateMany: vi.fn(async ({ data }: any) => {
          alert = { ...alert, ...data };
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn(async () => alert),
      },
    };
    const audit = { append: vi.fn(async () => ({})) };
    const service = new OperationsService(
      { $transaction: (callback: any) => callback(tx) } as any,
      audit as any,
      {} as any,
      config() as any,
    );
    await service.acknowledgeAlert(actor as any, "alert-1");
    expect(alert).toMatchObject({ state: "ACKNOWLEDGED", acknowledgedById: 1 });
    await service.resolveAlert(actor as any, "alert-1", "Dependency restored");
    expect(alert).toMatchObject({
      state: "RESOLVED",
      resolvedById: 1,
      resolution: "Dependency restored",
    });
    expect(audit.append).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "ALERT_RESOLVED" }),
      tx,
    );
  });

  it("requires an external ticket reference and postmortem for S1/repeated S2", async () => {
    expect(() =>
      createIncidentSchema.parse({
        externalTicketRef: "OPS-123",
        severity: "S1",
        reason: "password=leaked-value",
      }),
    ).toThrow();
    const input = createIncidentSchema.parse({
      externalTicketRef: "OPS-123",
      severity: "S2",
      repeatedS2: true,
      reason: "Storage unavailable",
    });
    const tx: any = {
      operationalIncident: {
        create: vi.fn(async ({ data }: any) => ({
          id: "incident-1",
          state: "ABIERTO",
          ...data,
        })),
      },
      operationalIncidentEvent: { create: vi.fn(async () => ({})) },
    };
    const service = new OperationsService(
      { $transaction: (callback: any) => callback(tx) } as any,
      { append: vi.fn(async () => ({})) } as any,
      {} as any,
      config() as any,
    );
    const incident = await service.createIncident(actor as any, input);
    expect(incident.postmortemDueAt).toBeInstanceOf(Date);
    expect(incident.postmortemDueAt!.getUTCDay()).not.toBe(0);
    expect(incident.postmortemDueAt!.getUTCDay()).not.toBe(6);
    expect(tx.operationalIncident.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalTicketRef: "OPS-123",
        repeatedS2: true,
      }),
    });
  });
});
