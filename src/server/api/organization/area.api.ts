import {
  actualizarAreaSchema,
  crearAreaSchema,
  idParamSchema,
} from "../../../schemas/organization";
import { requirePermission } from "../../http/guard";
import {
  created,
  handleError,
  ok,
  parseJsonBody,
  parseValue,
} from "../../http/responses";
import { Permission } from "../../permissions/permissions";
import {
  actualizarArea,
  crearArea,
  desactivarArea,
  listarAreas,
  obtenerArea,
} from "../../services/organization/area.service";

export async function getAreas(locals: App.Locals): Promise<Response> {
  const auth = requirePermission(locals, Permission.ORGANIZATION_READ);

  if (!auth.success) {
    return auth.response;
  }

  try {
    return ok(await listarAreas());
  } catch (error) {
    return handleError(error, "GET /api/organization/areas");
  }
}

export async function postArea(
  locals: App.Locals,
  request: Request,
): Promise<Response> {
  const auth = requirePermission(locals, Permission.ORGANIZATION_MANAGE);

  if (!auth.success) {
    return auth.response;
  }

  const body = await parseJsonBody(request, crearAreaSchema);

  if (!body.success) {
    return body.response;
  }

  try {
    return created(await crearArea(body.data));
  } catch (error) {
    return handleError(error, "POST /api/organization/areas");
  }
}

export async function getArea(
  locals: App.Locals,
  idParam: string | undefined,
): Promise<Response> {
  const auth = requirePermission(locals, Permission.ORGANIZATION_READ);

  if (!auth.success) {
    return auth.response;
  }

  const id = parseValue(idParamSchema, idParam);

  if (!id.success) {
    return id.response;
  }

  try {
    return ok(await obtenerArea(id.data));
  } catch (error) {
    return handleError(error, "GET /api/organization/areas/[id]");
  }
}

export async function putArea(
  locals: App.Locals,
  idParam: string | undefined,
  request: Request,
): Promise<Response> {
  const auth = requirePermission(locals, Permission.ORGANIZATION_MANAGE);

  if (!auth.success) {
    return auth.response;
  }

  const id = parseValue(idParamSchema, idParam);

  if (!id.success) {
    return id.response;
  }

  const body = await parseJsonBody(request, actualizarAreaSchema);

  if (!body.success) {
    return body.response;
  }

  try {
    return ok(await actualizarArea(id.data, body.data));
  } catch (error) {
    return handleError(error, "PUT /api/organization/areas/[id]");
  }
}

export async function deleteArea(
  locals: App.Locals,
  idParam: string | undefined,
): Promise<Response> {
  const auth = requirePermission(locals, Permission.ORGANIZATION_MANAGE);

  if (!auth.success) {
    return auth.response;
  }

  const id = parseValue(idParamSchema, idParam);

  if (!id.success) {
    return id.response;
  }

  try {
    return ok(await desactivarArea(id.data));
  } catch (error) {
    return handleError(error, "DELETE /api/organization/areas/[id]");
  }
}
