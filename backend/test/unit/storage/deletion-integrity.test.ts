import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { parseDeletionKeyring } from "../../../src/storage/deletion-keyring";
import { ObjectDeletionService } from "../../../src/storage/object-deletion.service";
import { runtimeGrants } from "../../../src/scripts/provision-runtime-db";

// Object-level jobs and acknowledgements join the same readiness decision.
const emptyObjectTables = () => ({
  orphanObjectDeletion: {
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
  },
  objectDeletionAcknowledgement: { findMany: vi.fn().mockResolvedValue([]) },
});

describe("deletion verification controls", () => {
  it("does not grant runtime deletion of durable object intentions", () => {
    expect(
      runtimeGrants("ares_test", "ares_runtime_test", "%", [
        "ObjectDeletionJob",
      ]),
    ).toEqual([
      "GRANT SELECT, INSERT, UPDATE ON `ares_test`.`ObjectDeletionJob` TO 'ares_runtime_test'@'%'",
    ]);
  });
  it("keeps cleanup intents non-deletable and acknowledgements append-only", () => {
    expect(
      runtimeGrants("ares_test", "ares_runtime_test", "%", [
        "OrphanObjectDeletion",
        "ObjectDeletionAcknowledgement",
      ]),
    ).toEqual([
      "GRANT SELECT, INSERT, UPDATE ON `ares_test`.`OrphanObjectDeletion` TO 'ares_runtime_test'@'%'",
      "GRANT SELECT, INSERT ON `ares_test`.`ObjectDeletionAcknowledgement` TO 'ares_runtime_test'@'%'",
    ]);
  });
  it("accepts only versioned verification secrets, not short or malformed rings", () => {
    expect(parseDeletionKeyring("")).toEqual({});
    expect(
      parseDeletionKeyring(
        '{"v1":"old-synthetic-signing-key-at-least-32-characters"}',
      ),
    ).toHaveProperty("v1");
    expect(() => parseDeletionKeyring('{"v1":"short"}')).toThrow();
    expect(() =>
      parseDeletionKeyring(
        '{"../v1":"old-synthetic-signing-key-at-least-32-characters"}',
      ),
    ).toThrow();
    expect(() => parseDeletionKeyring("bad-json")).toThrow();
  });
  it("does not approve recovery when a deletion is unfinished", async () => {
    const db: any = {
        ...emptyObjectTables(),
        objectDeletionJob: { count: vi.fn().mockResolvedValue(1) },
      },
      storage: any = { listDeletionIntents: vi.fn() };
    expect(
      await new ObjectDeletionService(
        db,
        storage,
        new ConfigService() as any,
      ).recoveryReady(),
    ).toBe(false);
    expect(storage.listDeletionIntents).not.toHaveBeenCalled();
  });
  it("detects an external intent missing from the restored SQL snapshot", async () => {
    const db: any = {
      ...emptyObjectTables(),
      objectDeletionJob: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const storage: any = {
      listDeletionIntents: vi
        .fn()
        .mockResolvedValue({ keys: ["deletion-intents/missing-proof.json"] }),
      deleteVersion: vi.fn(),
    };
    expect(
      await new ObjectDeletionService(
        db,
        storage,
        new ConfigService() as any,
      ).recoveryReady(),
    ).toBe(false);
    expect(storage.deleteVersion).not.toHaveBeenCalled();
  });
  it("classifies an orphan external intent without importing or deleting anything", async () => {
    const db: any = {
      ...emptyObjectTables(),
      objectDeletionJob: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
    };
    const storage: any = {
      listDeletionIntents: vi.fn().mockResolvedValue({
        keys: ["deletion-intents/a.json", "deletion-intents/b.json"],
      }),
      deleteVersion: vi.fn(),
    };
    const assessment = await new ObjectDeletionService(
      db,
      storage,
      new ConfigService() as any,
    ).recoveryAssessment();
    expect(assessment).toMatchObject({
      ready: false,
      unfinishedJobs: 0,
      truncated: false,
    });
    expect(assessment.orphanIntents).toEqual([
      { ref: "deletion-intents/a.json", reason: "NOT_IN_SQL" },
      { ref: "deletion-intents/b.json", reason: "NOT_IN_SQL" },
    ]);
    expect(db.objectDeletionJob.create).not.toHaveBeenCalled();
    expect(storage.deleteVersion).not.toHaveBeenCalled();
  });
  it("is ready only when SQL and the external store agree on an empty set", async () => {
    const db: any = {
      ...emptyObjectTables(),
      objectDeletionJob: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const storage: any = {
      listDeletionIntents: vi.fn().mockResolvedValue({ keys: [] }),
    };
    await expect(
      new ObjectDeletionService(
        db,
        storage,
        new ConfigService() as any,
      ).recoveryAssessment(),
    ).resolves.toMatchObject({ ready: true, orphanIntents: [] });
  });
});
