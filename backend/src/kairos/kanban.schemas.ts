import { z } from "zod";

const strictBoolean = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export const kanbanQuerySchema = z.object({
  responsableId: z.coerce.number().int().positive().optional(),
  participantId: z.coerce.number().int().positive().optional(),
  priority: z.enum(["BAJA", "MEDIA", "ALTA", "CRITICA"]).optional(),
  complexity: z.enum(["BAJA", "MEDIA", "ALTA"]).optional(),
  vencida: strictBoolean.optional(),
  limitPerLane: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export type KanbanQuery = z.infer<typeof kanbanQuerySchema>;
