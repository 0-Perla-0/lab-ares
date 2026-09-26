import { BadRequestException, Controller, Get, Param, Post, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { StorageService } from "./storage.service";

const maxBytes = Number(process.env.STORAGE_MAX_BYTES ?? 10 * 1024 * 1024);

@Controller("files")
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: maxBytes, files: 1 } }))
  async receive(@UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined, @Req() req: Request) {
    const actor = getAuthenticatedUser(req);
    if (!file) throw new BadRequestException("Archivo requerido");
    const stored = await this.storage.receive({ originalName: file.originalname, contentType: file.mimetype, body: file.buffer, sizeBytes: file.size, propietarioId: actor.id });
    return { data: { id: stored.id, status: stored.status, originalName: stored.originalName, detectedMime: stored.detectedMime, sizeBytes: stored.sizeBytes, createdAt: stored.createdAt } };
  }

  @Get(":id")
  async metadata(@Param("id") id: string, @Req() req: Request) {
    const actor = getAuthenticatedUser(req);
    return { data: await this.storage.metadata(id, actor.id) };
  }
}
