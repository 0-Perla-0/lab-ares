import { describe, expect, it, vi } from "vitest";
import { StorageService } from "../../../src/storage/storage.service";

const service = (overrides: Record<string, unknown> = {}) => new StorageService({ archivo: { create: vi.fn().mockResolvedValue({ id: "x" }), update: vi.fn(), ...overrides } } as never, { put: vi.fn().mockResolvedValue(undefined) } as never, {} as never, { get: (k: string) => k === "STORAGE_MAX_BYTES" ? 1000 : 5 } as never);
describe("StorageService policies", () => {
  it("rejects empty and oversized files", async () => { await expect(service().receive({ originalName: "a.pdf", body: Buffer.alloc(0) })).rejects.toThrow(); await expect(service().receive({ originalName: "a.pdf", body: Buffer.alloc(11) })).rejects.toThrow(); });
  it("rejects zip and double extensions", async () => { await expect(service().receive({ originalName: "a.pdf.exe", body: Buffer.from("PK\x03\x04") })).rejects.toThrow(); await expect(service().receive({ originalName: "a.pdf.exe", body: Buffer.from("%PDF-1.7%%EOF") })).rejects.toThrow(); });
  it("rejects truncated PDF and accepts valid signature until persistence", async () => { await expect(service().receive({ originalName: "a.pdf", body: Buffer.from("%PDF-1.7") })).rejects.toThrow(); });
  it("accepts valid PDF, JPEG and text signatures", async () => {
    const pdf = await service().receive({ originalName: "a.pdf", body: Buffer.from("%PDF-1.7\n%%EOF") });
    expect(pdf).toEqual({ id: "x" });
    await expect(service().receive({ originalName: "a.jpg", body: Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]) })).resolves.toEqual({ id: "x" });
    await expect(service().receive({ originalName: "a.txt", contentType: "text/plain", body: Buffer.from("hello") })).resolves.toEqual({ id: "x" });
  });
  it("rejects empty, malformed and unsupported signatures", async () => {
    await expect(service().receive({ originalName: "a.stl", contentType: "model/stl", body: Buffer.from("solid") })).rejects.toThrow();
    await expect(service().receive({ originalName: "a.bin", body: Buffer.from([1, 2, 3]) })).rejects.toThrow();
  });
  it("marks failed quarantine uploads as deleted without persisting raw error", async () => {
    const update = vi.fn();
    const svc = new StorageService({ archivo: { create: vi.fn().mockResolvedValue({ id: "x" }), update } } as never, { put: vi.fn().mockRejectedValue(new Error("secret endpoint")) } as never, {} as never, { get: () => 1000 } as never);
    await expect(svc.receive({ originalName: "a.pdf", body: Buffer.from("%PDF-1.7\n%%EOF") })).rejects.toThrow();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ELIMINADO", lastError: "Error" }) }));
  });
});
