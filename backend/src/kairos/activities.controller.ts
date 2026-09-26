import { Body, Controller, Get, Param, Patch, Post, Req, Query } from "@nestjs/common";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { KairosActivitiesService } from "./activities.service";
import {
  activitySchema,
  commentSchema,
  reopenSchema,
  reviewSchema,
  submitSchema,
  transitionSchema,
  updateActivitySchema,
  pageSchema,
} from "./activities.schemas";
@Controller("kairos/projects/:projectId/activities")
export class KairosActivitiesController {
  constructor(private readonly s: KairosActivitiesService) {}
  @Post() create(
    @Param("projectId") p: string,
    @Body(new ZodValidationPipe(activitySchema)) b: any,
    @Req() r: Request,
  ) {
    return this.s
      .create(getAuthenticatedUser(r), p, b)
      .then((data) => ({ data }));
  }
  @Get() list(@Param("projectId") p: string, @Query(new ZodValidationPipe(pageSchema)) q: any, @Req() r: Request) {
    return this.s.list(getAuthenticatedUser(r), p, q.page, q.pageSize).then((data) => ({ data }));
  }
  @Get(":id") get(
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Req() r: Request,
  ) {
    return this.s
      .get(getAuthenticatedUser(r), p, id)
      .then((data) => ({ data }));
  }
  @Patch(":id") update(
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateActivitySchema)) b: any,
    @Req() r: Request,
  ) {
    return this.s
      .update(getAuthenticatedUser(r), p, id, b)
      .then((data) => ({ data }));
  }
  @Post(":id/transition") transition(
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(transitionSchema)) b: any,
    @Req() r: Request,
  ) {
    return this.s
      .transition(getAuthenticatedUser(r), p, id, b.state, b.comment)
      .then((data) => ({ data }));
  }
  @Post(":id/submit") submit(
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(submitSchema)) b: any,
    @Req() r: Request,
  ) {
    return this.s
      .submit(getAuthenticatedUser(r), p, id, b.archivoId, b.comment)
      .then((data) => ({ data }));
  }
  @Post(":id/review") review(
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reviewSchema)) b: any,
    @Req() r: Request,
  ) {
    return this.s
      .review(getAuthenticatedUser(r), p, id, b.state, b.comment)
      .then((data) => ({ data }));
  }
  @Post(":id/reopen") reopen(
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reopenSchema)) b: any,
    @Req() r: Request,
  ) {
    return this.s
      .reopen(getAuthenticatedUser(r), p, id, b.reason)
      .then((data) => ({ data }));
  }
  @Get(":id/history") history(
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Query(new ZodValidationPipe(pageSchema)) q: any,
    @Req() r: Request,
  ) {
    return this.s
      .history(getAuthenticatedUser(r), p, id, q.page, q.pageSize)
      .then((data) => ({ data }));
  }
  @Get(":id/evidence") evidenceList(@Param("projectId") p: string, @Param("id") id: string, @Query(new ZodValidationPipe(pageSchema)) q: any, @Req() r: Request) {
    return this.s.evidenceList(getAuthenticatedUser(r), p, id, q.page, q.pageSize).then((data) => ({ data }));
  }
  @Get(":id/comments") comments(@Param("projectId") p: string, @Param("id") id: string, @Query(new ZodValidationPipe(pageSchema)) q: any, @Req() r: Request) {
    return this.s.comments(getAuthenticatedUser(r), p, id, q.page, q.pageSize).then((data) => ({ data }));
  }
  @Get(":id/evidence/:evidenceId/download") evidence(
    @Param("projectId") p: string,
    @Param("id") activityId: string,
    @Param("evidenceId") evidenceId: string,
    @Req() r: Request,
  ) {
    return this.s
      .evidenceDownload(getAuthenticatedUser(r), p, activityId, evidenceId)
      .then((data) => ({ data }));
  }
  @Post(":id/comments") comment(
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(commentSchema)) b: any,
    @Req() r: Request,
  ) {
    return this.s
      .comment(getAuthenticatedUser(r), p, id, b.body)
      .then((data) => ({ data }));
  }
}
