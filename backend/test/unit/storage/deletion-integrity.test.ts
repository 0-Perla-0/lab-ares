import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { parseDeletionKeyring } from "../../../src/storage/deletion-keyring";
import { ObjectDeletionService } from "../../../src/storage/object-deletion.service";
import { runtimeGrants } from "../../../src/scripts/provision-runtime-db";

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
});
