import type { APIRoute } from "astro";

import {
  actualizarSedeSchema,
  idParamSchema,
} from "../../../../schemas/organization";
import {
  handleError,
  ok,
  parseJsonBody,
  parseValue,
} from "../../../../server/http/responses";
import {
  actualizarSede,
  desactivarSede,
  obtenerSede,
} from "../../../../server/services/organization/sede.service";

export const prerender = false;

export const GET = (async ({ params }) => {
  const id = parseValue(idParamSchema, params.id);

  if (!id.success) {
    return id.response;
  }

  try {
    return ok(await obtenerSede(id.data));
  } catch (error) {
    return handleError(error, "GET /api/organization/sedes/[id]");
  }
}) satisfies APIRoute;

export const PUT = (async ({ params, request }) => {
  const id = parseValue(idParamSchema, params.id);

  if (!id.success) {
    return id.response;
  }

  const body = await parseJsonBody(request, actualizarSedeSchema);

  if (!body.success) {
    return body.response;
  }

  try {
    return ok(await actualizarSede(id.data, body.data));
  } catch (error) {
    return handleError(error, "PUT /api/organization/sedes/[id]");
  }
}) satisfies APIRoute;

export const DELETE = (async ({ params }) => {
  const id = parseValue(idParamSchema, params.id);

  if (!id.success) {
    return id.response;
  }

  try {
    return ok(await desactivarSede(id.data));
  } catch (error) {
    return handleError(error, "DELETE /api/organization/sedes/[id]");
  }
}) satisfies APIRoute;
