export const criticalIdempotencyParameter = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: {
    type: "string",
    pattern: "^[A-Za-z0-9_-]{16,100}$",
    minLength: 16,
    maxLength: 100,
  },
};
export function criticalWriteContracts<T extends Record<string, any>>(
  paths: T,
): T {
  return Object.fromEntries(
    Object.entries(paths).map(([path, methods]) => [
      path,
      Object.fromEntries(
        Object.entries(methods).map(([method, contract]: [string, any]) => {
          const critical =
            ["post", "patch", "put", "delete"].includes(method) &&
            (path.startsWith("/api/documents/") ||
              path.startsWith("/api/kairos/projects"));
          return [
            method,
            critical
              ? {
                  ...contract,
                  description: `${contract.description ?? ""} Requires durable Idempotency-Key; retry the unchanged operation after uncertain response. Current account/scope/membership revalidated on replay.`,
                  parameters: [
                    ...(contract.parameters ?? []),
                    ...((contract.parameters ?? []).some(
                      (parameter: { name: string }) =>
                        parameter.name === "Idempotency-Key",
                    )
                      ? []
                      : [criticalIdempotencyParameter]),
                  ],
                  responses: {
                    ...contract.responses,
                    409: {
                      description: "IDEMPOTENCY_KEY_REUSED or domain conflict",
                    },
                    503: { description: "Recovery write barrier; no new work" },
                  },
                }
              : contract,
          ];
        }),
      ),
    ]),
  ) as T;
}
export const expedientPaths = {
  "/api/documents/formalizations": {
    get: {
      tags: ["Documents"],
      security: [{ cookieAuth: [] }],
      parameters: [
        {
          name: "userId",
          in: "query",
          schema: { type: "integer", minimum: 1 },
        },
      ],
      responses: {
        200: {
          description:
            "Immutable formalizations visible under DOCUMENTS_READ scope (up to 100)",
        },
        401: { description: "Authentication required" },
        404: { description: "Not visible under current scope" },
      },
    },
    post: {
      tags: ["Documents"],
      security: [{ cookieAuth: [] }],
      description:
        "DOCUMENTS_REVIEW and recent authentication. Requires active PRESTADOR and confirmed current academic placement covering inicio, with active consistent catalogs. Records immutable academic/documentary snapshots; does not approve documents, grant permissions or credit hours. Account activation/uploads are not academic-gated. Same user/date cannot be formalized twice.",
      parameters: [criticalIdempotencyParameter],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["usuarioId", "inicio"],
              properties: {
                usuarioId: { type: "integer", minimum: 1 },
                inicio: { type: "string", format: "date" },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description:
            "Formalization, audit and private notification committed atomically",
        },
        400: { description: "Invalid input/header" },
        401: { description: "Authentication required" },
        403: {
          description: "Review permission/recent authentication required",
        },
        404: { description: "Target not visible/active or feature paused" },
        409: {
          description:
            "ACADEMIC_FORMALIZATION_REQUIRED, ACADEMIC_REFERENCE_CHANGED, EXPEDIENT_ALREADY_FORMALIZED or idempotency conflict",
        },
        503: { description: "Recovery barrier" },
      },
    },
  },
};
