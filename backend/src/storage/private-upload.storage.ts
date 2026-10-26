import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { UploadBudget } from "./upload-budget";
import { uploadAdmission } from "./upload-admission";
const budget = new UploadBudget();

export type PrivateUpload = {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
  directory: string;
  reservation?: symbol;
  admissionSlot?: string;
};
export async function cleanupPrivateUpload(file: PrivateUpload) {
  try {
    await rm(file.directory, { recursive: true, force: true });
  } finally {
    budget.release(file.reservation);
    await uploadAdmission()?.release(file.admissionSlot);
  }
}
// Multer's storage-engine protocol. No user-controlled names enter a disk path.
// Multer removes completed files on limit/extra-part errors; pipeline failures
// clean partial files here. The controller cleans success and domain failures.
export const privateUploadStorage = {
  _handleFile(
    _req: Request,
    file: { stream: Readable },
    callback: (error: unknown, info?: object) => void,
  ) {
    void (async () => {
      const reservation = budget.reserve(
        Number(process.env.STORAGE_MAX_CONCURRENT_UPLOADS ?? 4),
      );
      let directory: string | undefined;
      let admissionSlot: string | undefined;
      try {
        // Cross-replica ceiling (global and per user) on top of the local one.
        const admission = uploadAdmission();
        if (admission) {
          const actor = getAuthenticatedUser(_req);
          admissionSlot = await admission.reserve(actor.id);
        }
        directory = await mkdtemp(join(tmpdir(), "ares-http-upload-"));
        const path = join(directory, "payload");
        const output = createWriteStream(path, { mode: 0o600 });
        await pipeline(file.stream, output);
        await uploadAdmission()?.renew(admissionSlot);
        callback(null, {
          path,
          directory,
          size: output.bytesWritten,
          reservation,
          admissionSlot,
        });
      } catch (error) {
        try {
          if (directory) await rm(directory, { recursive: true, force: true });
        } finally {
          budget.release(reservation);
          await uploadAdmission()?.release(admissionSlot);
        }
        callback(error);
      }
    })().catch((error) => callback(error));
  },
  _removeFile(
    _req: Request,
    file: PrivateUpload,
    callback: (error?: unknown) => void,
  ) {
    void cleanupPrivateUpload(file).then(() => callback(), callback);
  },
};
