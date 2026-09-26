import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { KairosKanbanService } from "./kanban.service";
import { kanbanQuerySchema } from "./kanban.schemas";

@Controller("kairos/projects/:projectId/kanban")
export class KairosKanbanController {
  constructor(private readonly service: KairosKanbanService) {}

  @Get()
  get(
    @Param("projectId") projectId: string,
    @Query(new ZodValidationPipe(kanbanQuerySchema)) query: any,
    @Req() request: Request,
  ) {
    return this.service.get(getAuthenticatedUser(request), projectId, query).then((data) => ({ data }));
  }
}
