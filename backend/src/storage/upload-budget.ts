import { ApiException } from "../common/errors/api.exception";

/** A replica-local admission ceiling includes completed spools awaiting domain
 * processing. Disk/proxy quotas must additionally be enforced by deployment. */
export class UploadBudget {
  private readonly reservations = new Set<symbol>();
  reserve(limit: number): symbol {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32)
      throw new Error("Invalid upload concurrency ceiling");
    if (this.reservations.size >= limit)
      throw new ApiException("UPLOAD_CAPACITY_EXCEEDED", 503);
    const reservation = Symbol("private-upload");
    this.reservations.add(reservation);
    return reservation;
  }
  release(reservation?: symbol) {
    if (reservation) this.reservations.delete(reservation);
  }
}
