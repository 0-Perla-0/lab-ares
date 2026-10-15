import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { StorageService } from "./storage.service";
import { createReadStream } from "node:fs";
import {
  privateUploadStorage,
  cleanupPrivateUpload,
  type PrivateUpload,
} from "./private-upload.storage";

const maxBytes = Number(process.env.STORAGE_MAX_BYTES ?? 50 * 1024 * 1024);

@Controller("files")
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      storage: privateUploadStorage,
      limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 1 },
    }),
  )
  async receive(
    @UploadedFile()
    file: PrivateUpload | undefined,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException("Archivo requerido");
    try {
      const actor = getAuthenticatedUser(req);
      const stored = await this.storage.receive({
        originalName: file.originalname,
        contentType: file.mimetype,
        body: createReadStream(file.path),
        sizeBytes: file.size,
        propietarioId: actor.id,
      });
      return {
        data: {
          id: stored.id,
          status: stored.status,
          originalName: stored.originalName,
          detectedMime: stored.detectedMime,
          sizeBytes: Number(stored.sizeBytes),
          createdAt: stored.createdAt,
        },
      };
    } finally {
      await cleanupPrivateUpload(file);
    }
  }

  @Get(":id")
  async metadata(@Param("id") id: string, @Req() req: Request) {
    const actor = getAuthenticatedUser(req);
    return { data: await this.storage.metadata(id, actor.id) };
  }
}
