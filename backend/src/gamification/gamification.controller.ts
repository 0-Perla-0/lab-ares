import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import {
  gamificationBadgeSchema,
  gamificationIdempotencyKeySchema,
  gamificationPageSchema,
  gamificationRuleSchema,
  manualRecognitionSchema,
  reverseGamificationEventSchema,
} from "./gamification.schemas";
import { GamificationService } from "./gamification.service";

@Controller("gamification")
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  private key(value: string | undefined) {
    const result = gamificationIdempotencyKeySchema.safeParse(value);
    if (!result.success)
      throw new BadRequestException("INVALID_IDEMPOTENCY_KEY");
    return result.data;
  }

  @Get("me")
  @RequirePermissions(Permission.GAMIFICATION_READ)
  profile(@Req() req: Request) {
    return this.gamification
      .profile(getAuthenticatedUser(req))
      .then((data) => ({ data }));
  }

  @Get("me/history")
  @RequirePermissions(Permission.GAMIFICATION_READ)
  history(
    @Req() req: Request,
    @Query(new ZodValidationPipe(gamificationPageSchema)) query: any,
  ) {
    const actor = getAuthenticatedUser(req);
    return this.gamification
      .history(actor, actor.id, query)
      .then((data) => ({ data }));
  }

  @Get("admin/users/:id")
  @RequirePermissions(Permission.GAMIFICATION_MANAGE)
  adminProfile(@Req() req: Request, @Param("id", ParseIntPipe) id: number) {
    return this.gamification
      .profile(getAuthenticatedUser(req), id)
      .then((data) => ({ data }));
  }

  @Get("admin/users/:id/history")
  @RequirePermissions(Permission.GAMIFICATION_MANAGE)
  adminHistory(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
    @Query(new ZodValidationPipe(gamificationPageSchema)) query: any,
  ) {
    return this.gamification
      .history(getAuthenticatedUser(req), id, query)
      .then((data) => ({ data }));
  }

  @Get("admin/rules")
  @RequirePermissions(Permission.GAMIFICATION_MANAGE)
  rules(@Req() req: Request) {
    return this.gamification
      .listRules(getAuthenticatedUser(req))
      .then((data) => ({ data }));
  }

  @Post("admin/rules")
  @RequirePermissions(Permission.GAMIFICATION_MANAGE)
  createRule(
    @Req() req: Request,
    @Body(new ZodValidationPipe(gamificationRuleSchema)) body: any,
  ) {
    return this.gamification
      .createRuleVersion(getAuthenticatedUser(req), body)
      .then((data) => ({ data }));
  }

  @Get("admin/badges")
  @RequirePermissions(Permission.GAMIFICATION_MANAGE)
  badges(@Req() req: Request) {
    return this.gamification
      .listBadges(getAuthenticatedUser(req))
      .then((data) => ({ data }));
  }

  @Post("admin/badges")
  @RequirePermissions(Permission.GAMIFICATION_MANAGE)
  createBadge(
    @Req() req: Request,
    @Body(new ZodValidationPipe(gamificationBadgeSchema)) body: any,
  ) {
    return this.gamification
      .createBadgeVersion(getAuthenticatedUser(req), body)
      .then((data) => ({ data }));
  }

  @Post("admin/recognitions")
  @RequirePermissions(Permission.GAMIFICATION_MANAGE)
  recognize(
    @Req() req: Request,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(manualRecognitionSchema)) body: any,
  ) {
    return this.gamification
      .recognize(getAuthenticatedUser(req), body, this.key(idempotencyKey))
      .then((data) => ({ data }));
  }

  @Post("admin/events/:id/reverse")
  @RequirePermissions(Permission.GAMIFICATION_MANAGE)
  reverse(
    @Req() req: Request,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(reverseGamificationEventSchema)) body: any,
  ) {
    return this.gamification
      .reverseManual(
        getAuthenticatedUser(req),
        id,
        body.motivo,
        this.key(idempotencyKey),
      )
      .then((data) => ({ data }));
  }
}
