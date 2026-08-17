import { Controller, Get } from "@nestjs/common";

import { Public } from "../auth/public.decorator";
import { createOpenApiDocument } from "./openapi.document";

@Controller("docs")
export class OpenApiController {
  @Public()
  @Get("openapi.json")
  document() {
    return createOpenApiDocument();
  }
}
