import {
  actualizarTurnoSchema,
  crearTurnoSchema,
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
  actualizarTurno,
  crearTurno,
  desactivarTurno,
  listarTurnos,
  obtenerTurno,
} from "../../services/organization/turno.service";

export async function getTurnos(locals: App.Locals): Promise<Response> {
  const auth = requirePermission(locals, Permission.ORGANIZATION_READ);

  if (!auth.success) {
    return auth.response;
  }

  try {
    return ok(await listarTurnos());
  } catch (error) {
    return handleError(error, "GET /api/organization/turnos");
  }
}

export async function postTurno(
  locals: App.Locals,
  request: Request,
): Promise<Response> {
  const auth = requirePermission(locals, Permission.ORGANIZATION_MANAGE);

  if (!auth.success) {
    return auth.response;
  }

  const body = await parseJsonBody(request, crearTurnoSchema);

  if (!body.success) {
    return body.response;
  }

  try {
    return created(await crearTurno(body.data));
  } catch (error) {
    return handleError(error, "POST /api/organization/turnos");
  }
}

export async function getTurno(
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
    return ok(await obtenerTurno(id.data));
  } catch (error) {
    return handleError(error, "GET /api/organization/turnos/[id]");
  }
}

export async function putTurno(
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

  const body = await parseJsonBody(request, actualizarTurnoSchema);

  if (!body.success) {
    return body.response;
  }

  try {
    return ok(await actualizarTurno(id.data, body.data));
  } catch (error) {
    return handleError(error, "PUT /api/organization/turnos/[id]");
  }
}

export async function deleteTurno(
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
    return ok(await desactivarTurno(id.data));
  } catch (error) {
    return handleError(error, "DELETE /api/organization/turnos/[id]");
  }
}
