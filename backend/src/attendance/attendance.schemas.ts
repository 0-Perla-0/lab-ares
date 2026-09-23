import { z } from "zod";

export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,100}$/);
export const checkInSchema = z.object({}).strict();
export const checkOutSchema = z
  .object({ attendanceId: z.number().int().positive() })
  .strict();
export const manualCloseSchema = z
  .object({ reason: z.string().trim().min(5).max(500) })
  .strict();
export const attendanceQuerySchema = z
  .object({
    cursor: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
