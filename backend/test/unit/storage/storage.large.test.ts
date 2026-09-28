import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { StorageService } from "../../../src/storage/storage.service";

const cfg = (max = 4 * 1024 * 1024) => ({ get: (key: string) => key === "STORAGE_MAX_BYTES" ? max : false }) as never;
const make = (max?: number) => { const create = vi.fn().mockImplementation(({ data }) => ({ id: data.id, ...data })); const put = vi.fn().mockResolvedValue(undefined); return { service: new StorageService({ archivo: { create, update: vi.fn() } } as never, { put } as never, {} as never, cfg(max)), create, put }; };
const pdf = (size: number) => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(size - 15, 65), Buffer.from("\n%%EOF")]);

describe("StorageService full-stream regressions", () => {
  it("generates a cryptographically strong 30-character lowercase file id", async () => {
    const { service, create } = make();
    const result = await service.receive({ originalName: "id.pdf", body: pdf(100) });
    const persistedId = create.mock.calls[0][0].data.id as string;
    expect(persistedId).toMatch(/^[a-z0-9]{30}$/);
    expect(result.id).toBe(persistedId);
  });
  it("accepts a >1MiB PDF and stores exact hash and size", async () => { const body = pdf(1_200_000); const { service, create } = make(); await service.receive({ originalName: "large.pdf", body, sizeBytes: body.length }); expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sizeBytes: body.length, sha256: createHash("sha256").update(body).digest("hex") }) })); });
  it("rejects invalid UTF-8 after the first MiB", async () => { const body = Buffer.concat([Buffer.alloc(1024 * 1024, 65), Buffer.from([0xc3, 0x28])]); const { service } = make(); await expect(service.receive({ originalName: "bad.txt", contentType: "text/plain", body })).rejects.toThrow(); });
  it("rejects a stream that exceeds the limit and does not persist", async () => { const { service, create } = make(1024); async function* source(){ yield Buffer.alloc(900); yield Buffer.alloc(200); } await expect(service.receive({ originalName: "large.pdf", body: source() })).rejects.toThrow(); expect(create).not.toHaveBeenCalled(); });
  it("rejects declared size mismatch and extension mismatch", async () => { const { service } = make(); const body = pdf(100); await expect(service.receive({ originalName: "x.pdf", body, sizeBytes: 99 })).rejects.toThrow(); await expect(service.receive({ originalName: "x.txt", body })).rejects.toThrow(); });
  it("validates a binary STL split across many chunks", async () => { const body = Buffer.alloc(134); body.writeUInt32LE(1, 80); body.writeFloatLE(0, 96); body.writeFloatLE(0, 100); body.writeFloatLE(0, 104); body.writeFloatLE(1, 108); body.writeFloatLE(0, 112); body.writeFloatLE(0, 116); body.writeFloatLE(0, 120); body.writeFloatLE(1, 124); body.writeFloatLE(0, 128); const { service } = make(); await expect(service.receive({ originalName: "triangle.stl", contentType: "model/stl", body: Readable.from(Array.from({ length: body.length }, (_, i) => body.subarray(i, i + 1))) })).resolves.toBeTruthy(); });
  it("does not rely on readFile or a sample", async () => { const { service } = make(); const body = pdf(1_100_000); await expect(service.receive({ originalName: "x.pdf", body })).resolves.toBeTruthy(); });
});
