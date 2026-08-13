import {
  actualizarSedeSchema,
  crearSedeSchema,
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
  actualizarSede,
  crearSede,
  desactivarSede,
  listarSedes,
  obtenerSede,
} from "../../services/organization/sede.service";

/**
 * Capa API de Sedes: autoriza, valida y traduce a HTTP. Vive fuera de
 * src/pages porque ahí cualquier archivo se convertiría en una ruta, tests
 * incluidos; los archivos de src/pages/api son adaptadores de una línea.
 *
 * El guard va siempre primero: una petición anónima con body inválido debe
 * recibir 401, no filtrar que el body era inválido.
 */

export async function getSedes(locals: App.Locals): Promise<Response> {
  const auth = requirePermission(locals, Permission.ORGANIZATION_READ);

  if (!auth.success) {
    return auth.response;
  }

  try {
    return ok(await listarSedes());
  } catch (error) {
    return handleError(error, "GET /api/organization/sedes");
  }
}

export async function postSede(
  locals: App.Locals,
  request: Request,
): Promise<Response> {
  const auth = requirePermission(locals, Permission.ORGANIZATION_MANAGE);

  if (!auth.success) {
    return auth.response;
  }

  const body = await parseJsonBody(request, crearSedeSchema);

  if (!body.success) {
    return body.response;
  }

  try {
    return created(await crearSede(body.data));
  } catch (error) {
    return handleError(error, "POST /api/organization/sedes");
  }
}

export async function getSede(
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
    return ok(await obtenerSede(id.data));
  } catch (error) {
    return handleError(error, "GET /api/organization/sedes/[id]");
  }
}

export async function putSede(
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

  const body = await parseJsonBody(request, actualizarSedeSchema);

  if (!body.success) {
    return body.response;
  }

  try {
    return ok(await actualizarSede(id.data, body.data));
  } catch (error) {
    return handleError(error, "PUT /api/organization/sedes/[id]");
  }
}

export async function deleteSede(
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
    return ok(await desactivarSede(id.data));
  } catch (error) {
    return handleError(error, "DELETE /api/organization/sedes/[id]");
  }
}
