import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { StorageService } from "../../../src/storage/storage.service";
function make(max = 4096) {
  const db: any = {
    archivo: { create: vi.fn(({ data }) => Promise.resolve(data)) },
    $queryRaw: vi.fn(),
    recoveryWriteBarrier: {
      findUnique: vi.fn().mockResolvedValue({ active: false, version: 1 }),
    },
  };
  db.$transaction = vi.fn((fn) => fn(db));
  const bytes: Buffer[] = [];
  const storage: any = {
    put: vi.fn(async (_bucket, _key, stream) => {
      for await (const chunk of stream) bytes.push(chunk);
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const service = new StorageService(
    db,
    storage,
    {} as any,
    new ConfigService({ REPORTS_MAX_BYTES: max }) as any,
  );
  return { service, db, storage, bytes };
}
describe("bounded private generated CSV spool", () => {
  it("streams a known length to S3 and persists the full checksum", async () => {
    const h = make();
    const content = Buffer.from('\uFEFF"id"\r\n"1"\r\n');
    const result = await h.service.storeGeneratedCsvStream(
      1,
      "report",
      Readable.from([content.subarray(0, 4), content.subarray(4)]),
      1,
    );
    expect(Buffer.concat(h.bytes)).toEqual(content);
    expect(result).toMatchObject({
      sizeBytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
      propietarioId: 1,
    });
    expect(h.storage.put.mock.calls[0][4]).toBe(content.length);
    expect(h.storage.put.mock.calls[0][2]).toBeInstanceOf(Readable);
  });
  it("stops oversized generation before any S3 or metadata effect", async () => {
    const h = make(10);
    await expect(
      h.service.storeGeneratedCsvStream(
        1,
        "report",
        Readable.from([Buffer.alloc(11)]),
        1,
      ),
    ).rejects.toThrow("REPORT_SIZE_LIMIT_EXCEEDED");
    expect(h.storage.put).not.toHaveBeenCalled();
    expect(h.db.archivo.create).not.toHaveBeenCalled();
  });
  it("does not publish metadata or erase objects after the freeze epoch changed", async () => {
    const h = make();
    h.db.recoveryWriteBarrier.findUnique.mockResolvedValue({
      active: false,
      version: 3,
    });
    await expect(
      h.service.storeGeneratedCsvStream(
        1,
        "report",
        Readable.from([Buffer.from("csv")]),
        1,
      ),
    ).rejects.toMatchObject({ code: "RECOVERY_WRITE_BARRIER_ACTIVE" });
    expect(h.db.archivo.create).not.toHaveBeenCalled();
    expect(h.storage.delete).not.toHaveBeenCalled();
  });
  it("retains private preparation after uncertain metadata failure instead of unlogged deletion", async () => {
    const h = make();
    h.db.archivo.create.mockRejectedValue(new Error("DB_FAILURE"));
    await expect(
      h.service.storeGeneratedCsvStream(
        1,
        "report",
        Readable.from([Buffer.from("csv")]),
        1,
      ),
    ).rejects.toThrow("DB_FAILURE");
    expect(h.storage.delete).not.toHaveBeenCalled();
  });
});
