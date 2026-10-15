import { z } from "zod";
export const contingencySchema = z.strictObject({
  userId: z.number().int().positive(),
  date: z.iso.date(),
  checkInAt: z.iso.datetime(),
  checkOutAt: z.iso.datetime(),
  ticket: z.string().trim().min(3).max(150),
  reason: z.string().trim().min(5).max(500),
  justification: z.string().trim().min(10).max(1000),
});
