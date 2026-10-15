import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { Permission } from "../auth/permissions";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { idempotencyKeySchema } from "../attendance/attendance.schemas";
import { visitIdSchema } from "../visits/visits.schemas";
import { InventoryService } from "./inventory.service";
import { RequireFeature } from "../common/domain/feature-policy.guard";
import {
  inventoryQuerySchema,
  itemCreateSchema,
  loanSchema,
  loansQuerySchema,
  locationCreateSchema,
  movementSchema,
  returnSchema,
} from "./inventory.schemas";
const keyPipe = new ZodValidationPipe(idempotencyKeySchema);
@Controller("inventory")
export class InventoryController {
  constructor(private readonly service: InventoryService) {}
  @Get("locations")
  @RequirePermissions(Permission.INVENTORY_READ)
  async locations(@Req() req: Request) {
    return { data: await this.service.locations(getAuthenticatedUser(req)) };
  }
  @Post("locations")
  @RequireFeature("INVENTORY.MOVEMENT")
  @RequirePermissions(Permission.INVENTORY_MANAGE)
  async location(
    @Req() req: Request,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(locationCreateSchema))
    body: z.infer<typeof locationCreateSchema>,
  ) {
    return {
      data: await this.service.createLocation(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        body,
      ),
    };
  }
  @Get("items")
  @RequirePermissions(Permission.INVENTORY_READ)
  async items(
    @Req() req: Request,
    @Query(new ZodValidationPipe(inventoryQuerySchema))
    query: z.infer<typeof inventoryQuerySchema>,
  ) {
    return { data: await this.service.items(getAuthenticatedUser(req), query) };
  }
  @Post("items")
  @RequireFeature("INVENTORY.MOVEMENT")
  @RequirePermissions(Permission.INVENTORY_MANAGE)
  async create(
    @Req() req: Request,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(itemCreateSchema))
    body: z.infer<typeof itemCreateSchema>,
  ) {
    return {
      data: await this.service.createItem(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        body,
      ),
    };
  }
  @Get("items/:id/movements")
  @RequirePermissions(Permission.INVENTORY_READ)
  async ledger(
    @Req() req: Request,
    @Param("id", new ZodValidationPipe(visitIdSchema)) id: string,
    @Query(new ZodValidationPipe(inventoryQuerySchema))
    query: z.infer<typeof inventoryQuerySchema>,
  ) {
    return {
      data: await this.service.ledger(getAuthenticatedUser(req), id, query),
    };
  }
  @Post("movements")
  @RequireFeature("INVENTORY.MOVEMENT")
  @RequirePermissions(Permission.INVENTORY_MANAGE)
  async movement(
    @Req() req: Request,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(movementSchema))
    body: z.infer<typeof movementSchema>,
  ) {
    return {
      data: await this.service.movement(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        body,
      ),
    };
  }
  @Get("loans")
  @RequirePermissions(Permission.INVENTORY_READ)
  async loans(
    @Req() req: Request,
    @Query(new ZodValidationPipe(loansQuerySchema))
    query: z.infer<typeof loansQuerySchema>,
  ) {
    return { data: await this.service.loans(getAuthenticatedUser(req), query) };
  }
  @Post("loans")
  @RequireFeature("INVENTORY.MOVEMENT")
  @RequirePermissions(Permission.INVENTORY_LOAN)
  async loan(
    @Req() req: Request,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(loanSchema)) body: z.infer<typeof loanSchema>,
  ) {
    return {
      data: await this.service.loan(
        getAuthenticatedUser(req),
        keyPipe.transform(key),
        body,
      ),
    };
  }
  @Post("loans/:id/return")
  @RequirePermissions(Permission.INVENTORY_LOAN)
  async returnLoan(
    @Req() req: Request,
    @Param("id", new ZodValidationPipe(visitIdSchema)) id: string,
    @Headers("idempotency-key") key: string,
    @Body(new ZodValidationPipe(returnSchema))
    body: z.infer<typeof returnSchema>,
  ) {
    return {
      data: await this.service.returnLoan(
        getAuthenticatedUser(req),
        id,
        keyPipe.transform(key),
        body,
      ),
    };
  }
}
