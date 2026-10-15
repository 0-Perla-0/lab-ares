import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { FilesController } from "../src/storage/files.controller";
import type { AuthUser } from "../src/auth/auth-user";
import { EstadoUsuario } from "../src/generated/prisma/enums";
import { mkdtemp, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

const user = (id = 42): AuthUser => ({
  id,
  codigo: `U${id}`,
  email: `${id}@test.local`,
  rol: "PRESTADOR",
  estado: EstadoUsuario.ACTIVA,
  areaId: 1,
  sedeId: 1,
  turnoId: null,
});
const req = (actor: AuthUser) => ({ user: actor }) as any;

describe("FilesController upload boundary", () => {
  it("rejects a missing multipart file", async () => {
    const storage = { receive: vi.fn() };
    await expect(
      new FilesController(storage as never).receive(undefined, req(user())),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.receive).not.toHaveBeenCalled();
  });

  it("passes the authenticated owner and multipart metadata to storage", async () => {
    const storage = {
      receive: vi.fn().mockImplementation(async (input) => {
        expect(input.body).toBeInstanceOf(Readable);
        for await (const _chunk of input.body) {
          /* consume the disk-backed stream */
        }
        return {
          id: "f-1",
          status: "PENDIENTE_ANALISIS",
          originalName: "x.pdf",
          detectedMime: "application/pdf",
          sizeBytes: 12n,
          createdAt: new Date(),
          objectKey: "secret",
        };
      }),
    };
    const directory = await mkdtemp(join(tmpdir(), "ares-http-upload-test-"));
    const path = join(directory, "payload");
    await writeFile(path, Buffer.from("%PDF"));
    const file = {
      originalname: "x.pdf",
      mimetype: "application/pdf",
      size: 12,
      path,
      directory,
    };
    const result = await new FilesController(storage as never).receive(
      file,
      req(user(77)),
    );
    expect(storage.receive).toHaveBeenCalledWith(
      expect.objectContaining({
        originalName: "x.pdf",
        contentType: "application/pdf",
        sizeBytes: 12,
        propietarioId: 77,
      }),
    );
    expect(JSON.stringify(result)).not.toMatch(/objectKey|quarantineKey/);
    await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
