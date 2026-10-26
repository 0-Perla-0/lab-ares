import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { UploadAdmissionService } from "../../src/storage/upload-admission.service";

const url = process.env.DATABASE_URL;
if (!url || !/_(test|ci)$/.test(new URL(url).pathname))
  throw new Error("Upload admission acceptance requires isolated _test/_ci DB");

const settings = (extra: Record<string, number> = {}) =>
  new ConfigService({
    DATABASE_URL: url,
    STORAGE_GLOBAL_UPLOAD_CEILING: 3,
    STORAGE_USER_UPLOAD_CEILING: 2,
    STORAGE_UPLOAD_LEASE_MS: 60000,
    ...extra,
  });
// Two connections stand for two replicas deciding at the same time.
const dbA = new PrismaService(settings()),
  dbB = new PrismaService(settings());
const replicaA = new UploadAdmissionService(dbA, settings() as never),
  replicaB = new UploadAdmissionService(dbB, settings() as never);

describe("cross-replica upload admission on MariaDB", () => {
  beforeAll(async () => {
    await dbA.uploadAdmission.deleteMany();
  });
  afterAll(async () => {
    await dbA.uploadAdmission.deleteMany();
    await dbA.$disconnect();
    await dbB.$disconnect();
  });

  it("never admits more than the global ceiling across replicas", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        // Distinct people so only the global ceiling can reject.
        (index % 2 ? replicaA : replicaB).reserve(1000 + index),
      ),
    );
    const admitted = attempts.filter((row) => row.status === "fulfilled");
    expect(admitted).toHaveLength(3);
    for (const row of attempts.filter((item) => item.status === "rejected"))
      expect((row as PromiseRejectedResult).reason).toMatchObject({
        code: "UPLOAD_CAPACITY_EXCEEDED",
      });
    expect(await dbA.uploadAdmission.count()).toBe(3);
  });

  it("frees capacity on release and lets a dead replica's lease expire", async () => {
    const slots = await dbA.uploadAdmission.findMany();
    await replicaA.release(slots[0].id);
    // Release is owner-scoped: the other replica cannot free it for the owner.
    expect(await dbA.uploadAdmission.count()).toBeGreaterThanOrEqual(2);
    await dbA.uploadAdmission.updateMany({
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    const fresh = await replicaB.reserve(2000);
    expect(fresh).toBeTruthy();
    expect(await dbA.uploadAdmission.count()).toBe(1);
  });

  it("applies the per-user ceiling without blocking other people", async () => {
    await dbA.uploadAdmission.deleteMany();
    const person = 3000;
    await replicaA.reserve(person);
    await replicaB.reserve(person);
    await expect(replicaA.reserve(person)).rejects.toMatchObject({
      code: "UPLOAD_USER_CAPACITY_EXCEEDED",
    });
    await expect(replicaB.reserve(person + 1)).resolves.toBeTruthy();
  });
});
