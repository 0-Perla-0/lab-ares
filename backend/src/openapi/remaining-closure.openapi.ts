import { criticalIdempotencyParameter } from "./expedient.openapi";
const security = [{ cookieAuth: [] }];
const errors = {
  400: { description: "Strict validation" },
  401: { description: "Current active session required" },
  403: { description: "Permission or recent authentication required" },
  404: { description: "Not visible under current organizational scope" },
  409: { description: "Version/state/idempotency conflict" },
  503: { description: "Recovery write barrier" },
};
const reason = { type: "string", minLength: 10, maxLength: 500 };
export const remainingClosurePaths = {
  "/api/service-periods": {
    get: {
      tags: ["Documents"],
      security,
      description:
        "DOCUMENTS_READ; paginated operational periods and append-only events under current SELF/AREA/SEDE/GLOBAL scope.",
      parameters: [
        {
          name: "userId",
          in: "query",
          schema: { type: "integer", minimum: 1 },
        },
        {
          name: "page",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 10000 },
        },
        {
          name: "pageSize",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 100 },
        },
      ],
      responses: {
        200: {
          description:
            "items/total/page/pageSize; no hour credit or legal release",
        },
        ...errors,
      },
    },
    post: {
      tags: ["Documents"],
      security,
      description:
        "DOCUMENTS_REVIEW + recent authentication. Another authority registers a period against an existing academic formalization; one period per formalization. Dates are immutable, no inferred hours, targets or legal release. Correct by cancelling and recording a new formalization/period.",
      parameters: [criticalIdempotencyParameter],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["formalizacionId", "fin", "motivo"],
              properties: {
                formalizacionId: {
                  type: "string",
                  pattern: "^c[a-z0-9]{20,30}$",
                },
                fin: { type: "string", format: "date" },
                motivo: reason,
              },
            },
          },
        },
      },
      responses: {
        201: {
          description:
            "Period, event, audit, notice/outbox and receipt commit together",
        },
        ...errors,
      },
    },
  },
  "/api/service-periods/{id}/transition": {
    post: {
      tags: ["Documents"],
      security,
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^c[a-z0-9]{20,30}$" },
        },
        criticalIdempotencyParameter,
      ],
      description:
        "DOCUMENTS_REVIEW + recent authentication. REGISTRADO -> INICIADO -> CERRADO; REGISTRADO/INICIADO -> CANCELADO. Starting revalidates academic coverage and feature policy; closure/cancellation remain available when new work is paused. Terminal periods cannot reopen. No legal release or attendance effect.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["expectedVersion", "estado", "motivo"],
              properties: {
                expectedVersion: { type: "integer", minimum: 1 },
                estado: {
                  type: "string",
                  enum: ["INICIADO", "CERRADO", "CANCELADO"],
                },
                motivo: reason,
              },
            },
          },
        },
      },
      responses: {
        201: {
          description:
            "Versioned transition and immutable event committed once",
        },
        ...errors,
      },
    },
  },
  "/api/operation-intents/{key}": {
    get: {
      tags: ["Operations"],
      security,
      parameters: [
        {
          name: "key",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^[A-Za-z0-9._:-]{16,128}$" },
        },
      ],
      description:
        "Self-owned receipt lookup across domain/attendance/absence/retention/printing/recovery. Only commit source/date, never stored response or resource data. COMMITTED does not grant replay authorization. UNCONFIRMED does not prove cancellation or exclude an in-flight transaction. No automatic replay.",
      responses: {
        200: { description: "COMMITTED or UNCONFIRMED and receipt metadata" },
        ...errors,
      },
    },
  },
  "/api/retention/adapters": {
    get: {
      tags: ["Retention"],
      security,
      description:
        "RETENTION_READ GLOBAL. Explicit executable adapter/category/action catalog and institutional approval ceiling; missing adapters have no implicit treatment.",
      responses: {
        200: {
          description:
            "Executable adapter inventory, not institutional approval",
        },
        ...errors,
      },
    },
  },
};
