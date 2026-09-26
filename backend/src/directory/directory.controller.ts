import { Body, Controller, Get, Patch, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { Permission } from "../auth/permissions";
import { getAuthenticatedUser } from "../auth/authenticated-user";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe";
import { DirectoryService } from "./directory.service";
import { preferenceSchema, querySchema, type DirectoryQuery } from "./directory.schemas";
@Controller("directory")
@RequirePermissions(Permission.DIRECTORY_READ)
export class DirectoryController { constructor(private readonly s:DirectoryService){} @Get() list(@Query(new ZodValidationPipe(querySchema)) q:DirectoryQuery,@Req() r:Request){return this.s.list(getAuthenticatedUser(r),q).then(data=>({data}));} @Get("preferences/me") preferences(@Req()r:Request){return this.s.getPreferences(getAuthenticatedUser(r)).then(data=>({data}));} @Patch("preferences/me") update(@Body(new ZodValidationPipe(preferenceSchema)) body:any,@Req()r:Request){return this.s.updatePreferences(getAuthenticatedUser(r),body).then(data=>({data}));} }
