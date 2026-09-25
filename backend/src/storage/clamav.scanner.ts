import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import net from "node:net";
import { Readable } from "node:stream";
import type { Environment } from "../config/environment";
import type { MalwareScanner } from "./storage.types";

@Injectable()
export class ClamAvScanner implements MalwareScanner {
  constructor(private readonly config: ConfigService<Environment, true>) {}
  health() { return new Promise<boolean>((resolve) => { const s = net.createConnection({ host: this.config.get("CLAMAV_HOST"), port: this.config.get("CLAMAV_PORT") }); let settled = false; const done = (v: boolean) => { if (settled) return; settled = true; s.removeAllListeners(); s.destroy(); resolve(v); }; s.setTimeout(2000, () => done(false)); s.once("error", () => done(false)); s.once("connect", () => { s.write("PING\0"); s.once("data", d => done(d.toString().includes("PONG"))); }); }); }
  async scan(stream: Readable) { return new Promise<{clean: boolean; signature?: string}>((resolve, reject) => {
    const s = net.createConnection({ host: this.config.get("CLAMAV_HOST"), port: this.config.get("CLAMAV_PORT") }); let settled = false; let output = "";
    const timer = setTimeout(() => { stream.destroy(); finish(new Error("ClamAV timeout")); }, 30000);
    const finish = (error?: Error, result?: {clean: boolean; signature?: string}) => { if (settled) return; settled = true; clearTimeout(timer); stream.removeAllListeners(); s.removeAllListeners(); s.destroy(); error ? reject(error) : resolve(result!); };
    s.once("error", e => finish(e)); s.once("close", () => { if (!settled) finish(output.includes("FOUND") ? undefined : output.includes("OK") ? undefined : new Error("Invalid ClamAV response"), output.includes("FOUND") ? { clean: false, signature: output.slice(-512) } : output.includes("OK") ? { clean: true } : undefined); });
    s.once("connect", () => { s.write("zINSTREAM\0"); stream.on("data", (chunk: Buffer) => { if (chunk.length > 1024 * 1024) return finish(new Error("Chunk too large")); const head = Buffer.alloc(4); head.writeUInt32BE(chunk.length); if (!s.write(Buffer.concat([head, chunk]))) stream.pause(); }); s.on("drain", () => stream.resume()); stream.once("end", () => { const end = Buffer.alloc(4); s.end(end); }); stream.once("error", e => finish(e)); });
    s.on("data", d => { output = (output + d.toString()).slice(-512); });
  }); }
}
