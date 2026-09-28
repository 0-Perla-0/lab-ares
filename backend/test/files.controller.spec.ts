import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { FilesController } from "../src/storage/files.controller";
import type { AuthUser } from "../src/auth/auth-user";
import { EstadoUsuario } from "../src/generated/prisma/enums";

const user = (id = 42): AuthUser => ({ id, codigo: `U${id}`, email: `${id}@test.local`, rol: "PRESTADOR", estado: EstadoUsuario.ACTIVA, areaId: 1, sedeId: 1, turnoId: null });
const req = (actor: AuthUser) => ({ user: actor }) as any;

describe("FilesController upload boundary", () => {
  it("rejects a missing multipart file", async () => {
    const storage = { receive: vi.fn() };
    await expect(new FilesController(storage as never).receive(undefined, req(user()))).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.receive).not.toHaveBeenCalled();
  });

  it("passes the authenticated owner and multipart metadata to storage", async () => {
    const storage = { receive: vi.fn().mockResolvedValue({ id: "f-1", status: "PENDIENTE_ANALISIS", originalName: "x.pdf", detectedMime: "application/pdf", sizeBytes: 12, createdAt: new Date(), objectKey: "secret" }) };
    const file = { originalname: "x.pdf", mimetype: "application/pdf", size: 12, buffer: Buffer.from("%PDF") };
    const result = await new FilesController(storage as never).receive(file, req(user(77)));
    expect(storage.receive).toHaveBeenCalledWith(expect.objectContaining({ originalName: "x.pdf", contentType: "application/pdf", sizeBytes: 12, propietarioId: 77 }));
    expect(JSON.stringify(result)).not.toMatch(/objectKey|quarantineKey/);
  });
});
