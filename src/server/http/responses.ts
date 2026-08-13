import { z } from "zod";

import { DomainError, type DomainErrorKind } from "../errors/domain-error";

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

const statusByKind: Record<DomainErrorKind, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
};

export function ok<T>(data: T): Response {
  return Response.json({ data }, { status: 200, headers: noStoreHeaders });
}

export function created<T>(data: T): Response {
  return Response.json({ data }, { status: 201, headers: noStoreHeaders });
}

export function errorResponse(code: string, status: number): Response {
  return Response.json({ error: code }, { status, headers: noStoreHeaders });
}

function validationError(details: unknown): Response {
  return Response.json(
    { error: "VALIDATION_ERROR", details },
    { status: 400, headers: noStoreHeaders },
  );
}

/**
 * Único punto donde un fallo se convierte en status HTTP. Los errores
 * inesperados se registran en servidor y salen como 500 genérico: nunca se
 * expone el mensaje original al cliente.
 */
export function handleError(error: unknown, context: string): Response {
  if (error instanceof DomainError) {
    return Response.json(
      { error: error.code },
      { status: statusByKind[error.kind], headers: noStoreHeaders },
    );
  }

  console.error(`${context} failed:`, error);

  return Response.json(
    { error: "INTERNAL_SERVER_ERROR" },
    { status: 500, headers: noStoreHeaders },
  );
}

/**
 * Resultado de una comprobación en el borde HTTP: o sigue el handler con un
 * valor ya tipado, o se corta devolviendo la Response que corresponda.
 */
export type Parsed<T> =
  { success: true; data: T } | { success: false; response: Response };

export function parseValue<T>(schema: z.ZodType<T>, value: unknown): Parsed<T> {
  const result = schema.safeParse(value);

  if (!result.success) {
    return {
      success: false,
      response: validationError(z.treeifyError(result.error)),
    };
  }

  return { success: true, data: result.data };
}

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<Parsed<T>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      response: validationError({ errors: ["Invalid JSON body"] }),
    };
  }

  return parseValue(schema, body);
}
