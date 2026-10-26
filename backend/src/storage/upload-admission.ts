/** Multer storage engines are static, so the injectable admission registers here. */
export interface UploadAdmission {
  reserve(actorId: number): Promise<string | undefined>;
  renew(slot?: string): Promise<void>;
  release(slot?: string): Promise<void>;
}

let current: UploadAdmission | undefined;
export function registerUploadAdmission(admission: UploadAdmission) {
  current = admission;
}
export function uploadAdmission() {
  return current;
}
