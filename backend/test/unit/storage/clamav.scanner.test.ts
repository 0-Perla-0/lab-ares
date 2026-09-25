import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const sockets: any[] = [];
vi.mock("node:net", () => ({ default: { createConnection: vi.fn(() => { const s: any = new EventEmitter(); s.write = vi.fn(); s.end = vi.fn(); s.destroy = vi.fn(); s.setTimeout = vi.fn((_n: number, cb: () => void) => { s.timeoutCb = cb; }); sockets.push(s); return s; }) } }));
import { ClamAvScanner } from "../../../src/storage/clamav.scanner";
const scanner = () => new ClamAvScanner({ get: (k: string) => k === "CLAMAV_HOST" ? "localhost" : 3310 } as never);
describe("ClamAvScanner protocol", () => {
  it("performs PING health check", async () => { const p = scanner().health(); sockets.at(-1).emit("connect"); sockets.at(-1).emit("data", Buffer.from("PONG\0")); await expect(p).resolves.toBe(true); expect(sockets.at(-1).write).toHaveBeenCalledWith("PING\0"); });
  it("reports clean and infected INSTREAM responses", async () => {
    const clean = scanner().scan(Readable.from([Buffer.from("abc")])); sockets.at(-1).emit("connect"); sockets.at(-1).emit("data", Buffer.from("stream: OK")); sockets.at(-1).emit("close"); await expect(clean).resolves.toEqual({ clean: true });
    const bad = scanner().scan(Readable.from([Buffer.from("abc")])); sockets.at(-1).emit("connect"); sockets.at(-1).emit("data", Buffer.from("stream: Eicar FOUND")); sockets.at(-1).emit("close"); await expect(bad).resolves.toMatchObject({ clean: false });
  });
  it("fails closed on invalid response and disconnect", async () => { const p = scanner().scan(Readable.from([Buffer.from("abc")])); sockets.at(-1).emit("connect"); sockets.at(-1).emit("data", Buffer.from("wat")); sockets.at(-1).emit("close"); await expect(p).rejects.toThrow("Invalid ClamAV response"); });
  it("settles once and cleans up on timeout", async () => { vi.useFakeTimers(); const stream = Readable.from([Buffer.from("abc")]); const p = scanner().scan(stream); const s = sockets.at(-1); s.emit("connect"); vi.advanceTimersByTime(30000); s.emit("close"); await expect(p).rejects.toThrow("ClamAV timeout"); expect(s.destroy).toHaveBeenCalled(); vi.useRealTimers(); });
  it("settles once on disconnect/error", async () => { const p = scanner().scan(Readable.from([Buffer.from("abc")])); const s = sockets.at(-1); s.emit("error", new Error("disconnect")); s.emit("close"); await expect(p).rejects.toThrow("disconnect"); });
});
import { Readable } from "node:stream";
