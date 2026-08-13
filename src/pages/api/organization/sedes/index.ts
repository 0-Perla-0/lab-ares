import type { APIRoute } from "astro";

import { crearSedeSchema } from "../../../../schemas/organization";
import {
  created,
  handleError,
  ok,
  parseJsonBody,
} from "../../../../server/http/responses";
import {
  crearSede,
  listarSedes,
} from "../../../../server/services/organization/sede.service";

export const prerender = false;

export const GET = (async () => {
  try {
    return ok(await listarSedes());
  } catch (error) {
    return handleError(error, "GET /api/organization/sedes");
  }
}) satisfies APIRoute;

export const POST = (async ({ request }) => {
  const body = await parseJsonBody(request, crearSedeSchema);

  if (!body.success) {
    return body.response;
  }

  try {
    return created(await crearSede(body.data));
  } catch (error) {
    return handleError(error, "POST /api/organization/sedes");
  }
}) satisfies APIRoute;
