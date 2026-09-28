import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UsePipes,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { Permission } from "../auth/permissions";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { ReportsService } from "./reports.service";
import { rangeSchema, exportSchema } from "./reports.schemas";
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get("operational-metrics")
  @RequirePermissions(Permission.REPORTS_READ)
  @UsePipes(new ZodValidationPipe(rangeSchema))
  metrics(@Req() r: Request, @Query() q: any) {
    return this.reports
      .metrics(getAuthenticatedUser(r), q)
      .then((data) => ({ data }));
  }
  @Post("export")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.REPORTS_EXPORT)
  @UsePipes(new ZodValidationPipe(exportSchema))
  async export(@Req() r: Request, @Body() b: any, @Res() res: Response) {
    const out = await this.reports.requestExport(getAuthenticatedUser(r), b);
    if (out.sync) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${out.filename}"`,
      );
      return res.send(out.body);
    }
    res.status(202).json({ data: out.job });
  }
  @Get("export/:id/status")
  @RequirePermissions(Permission.REPORTS_EXPORT)
  status(@Req() r: Request, @Param("id") id: string) {
    return this.reports
      .status(getAuthenticatedUser(r), id)
      .then((data) => ({ data }));
  }
  @Get("export/:id/download")
  @RequirePermissions(Permission.REPORTS_EXPORT)
  download(@Req() r: Request, @Param("id") id: string) {
    return this.reports
      .download(getAuthenticatedUser(r), id)
      .then((data) => ({ data }));
  }
}
