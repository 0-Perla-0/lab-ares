import { z } from "zod";
const iso = z.string().datetime({ offset: true });
export const rangeSchema = z
  .object({ from: iso.optional(), to: iso.optional() })
  .strict();
export const exportSchema = rangeSchema
  .extend({ type: z.enum(["ATTENDANCE", "DOCUMENTS", "KAIROS"]) })
  .strict();
export type ReportRange = z.infer<typeof rangeSchema>;
