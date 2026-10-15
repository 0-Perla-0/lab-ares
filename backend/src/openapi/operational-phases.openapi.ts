import { z } from "zod";
import { contingencySchema } from "../attendance/attendance-contingency.schemas";
import {
  coordinatesSchema,
  locationPolicySchema,
} from "../attendance/attendance-signals";
import {
  inventoryQuerySchema,
  itemCreateSchema,
  loanSchema,
  loansQuerySchema,
  locationCreateSchema,
  movementSchema,
  returnSchema,
} from "../inventory/inventory.schemas";
import {
  visitActionSchema,
  visitCancelSchema,
  visitCreateSchema,
  visitEntrySchema,
  visitQuerySchema,
} from "../visits/visits.schemas";
import { retryJobSchema } from "../operations/operations.schemas";
const jsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const id = { type: "string", minLength: 1, maxLength: 30 };
const timestamp = { type: ["string", "null"], format: "date-time" };
const envelope = (schema: object) => ({
  type: "object",
  required: ["data"],
  properties: { data: schema },
});
const key = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", pattern: "^[A-Za-z0-9_-]{16,100}$" },
};
const parameter = (name: string, schema: object = id) => ({
  name,
  in: "path",
  required: true,
  schema,
});
const query = (schema: z.ZodType) => {
  const json = jsonSchema(schema) as { properties?: Record<string, object> };
  return Object.entries(json.properties ?? {}).map(([name, value]) => ({
    name,
    in: "query",
    schema: value,
  }));
};
const errors = {
  400: { description: "VALIDATION_ERROR or invalid interval/window" },
  401: { description: "Active session required" },
  403: { description: "Permission/scope or separation of duties denied" },
  404: { description: "Not found or FEATURE_DISABLED" },
  409: {
    description:
      "State/version conflict, reused idempotency key, overlap, stock invalid, ledger mismatch or RETRY_REQUIRED",
  },
  503: { description: "RECOVERY_WRITE_BARRIER_ACTIVE; no write confirmed" },
};
function operation(
  tag: string,
  summary: string,
  permission: string,
  response: object,
  schema?: z.ZodType,
  parameters: object[] = [],
) {
  return {
    tags: [tag],
    summary,
    security: [{ cookieAuth: [] }],
    "x-permission": permission,
    parameters: [...parameters, ...(schema ? [key] : [])],
    ...(schema
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: jsonSchema(schema) } },
          },
        }
      : {}),
    responses: {
      [schema ? "201" : "200"]: {
        description: "Server-confirmed result",
        content: { "application/json": { schema: envelope(response) } },
      },
      ...errors,
    },
  };
}
const visitResponse = {
  type: "object",
  required: ["id", "estado", "version", "nombreVisitante"],
  properties: {
    id,
    nombreVisitante: { type: "string" },
    institucionProcedencia: { type: ["string", "null"] },
    motivo: { type: "string" },
    sedeId: { type: "integer" },
    areaId: { type: ["integer", "null"] },
    anfitrionId: { type: "integer" },
    fechaProgramada: timestamp,
    validaDesde: timestamp,
    validaHasta: timestamp,
    estado: {
      enum: [
        "EMITIDA",
        "REGISTRADA_ENTRADA",
        "REGISTRADA_SALIDA",
        "VENCIDA",
        "CANCELADA",
      ],
    },
    version: { type: "integer" },
    tokenKeyVersion: {
      type: "string",
      maxLength: 32,
      description: "Version identifier only, never key material",
    },
    evidenceSuppressedAt: timestamp,
    codeAvailable: {
      type: "boolean",
      description:
        "False for non-host, retired key version or suppressed evidence",
    },
    entradaAt: timestamp,
    salidaAt: timestamp,
    code: {
      type: "string",
      pattern: "^[a-f0-9]{64}$",
      description: "Host only; never authorizes entry. Hash is never exposed.",
    },
  },
};
const itemResponse = {
  type: "object",
  properties: {
    id,
    codigo: { type: "string" },
    nombre: { type: "string" },
    tipo: { enum: ["CONSUMIBLE", "ACTIVO"] },
    cantidadStock: {
      type: "string",
      description: "Exact Decimal ledger materialization",
    },
    umbralMinimo: { type: ["string", "null"] },
    estadoActivo: {
      enum: [
        "DISPONIBLE",
        "EN_PRESTAMO",
        "EN_MANTENIMIENTO",
        "DANIADO",
        "BAJA",
        null,
      ],
    },
    version: { type: "integer" },
    stockBajo: { type: "boolean" },
  },
};
const page = (items: object) => ({
  type: "object",
  properties: {
    items: { type: "array", items },
    nextCursor: { type: ["string", "null"] },
  },
});
export const operationalPhaseSchemas = {
  Coordinates: jsonSchema(coordinatesSchema),
  AttendanceLocationPolicy: jsonSchema(locationPolicySchema),
  Visit: visitResponse,
  InventoryItem: itemResponse,
  ContingencyInput: jsonSchema(contingencySchema),
};
export const operationalPhasePaths = {
  "/api/attendance/contingency": {
    post: operation(
      "Attendance",
      "Audited contingency capture; pending, never authorizes hours; different authority required",
      "attendance:manage",
      ref("Attendance"),
      contingencySchema,
    ),
  },
  "/api/attendance/{id}/signals": {
    get: operation(
      "Attendance",
      "Audited access to private IP/coordinates; chiefs/audit within scope only",
      "audit:read",
      {
        type: "object",
        properties: {
          clientIp: { type: ["string", "null"] },
          geoLatitude: { type: ["string", "null"] },
          geoLongitude: { type: ["string", "null"] },
          geoAccuracyMeters: { type: ["number", "null"] },
          locationRiskCode: { type: ["string", "null"] },
          checkout: { type: ["object", "null"] },
        },
      },
      undefined,
      [parameter("id", { type: "integer", minimum: 1 })],
    ),
  },
  "/api/health/operating-mode": {
    get: operation(
      "Health",
      "Authenticated read-only state, no recovery run details",
      "authenticated",
      {
        type: "object",
        properties: {
          readOnly: { type: "boolean" },
          snapshotAt: timestamp,
          serverTime: timestamp,
        },
      },
    ),
  },
  "/api/visits/invitations": {
    get: operation(
      "Visits",
      "Own or scoped invitations; expiry is computed without writes",
      "visits:request",
      page(ref("Visit")),
      undefined,
      query(visitQuerySchema),
    ),
    post: operation(
      "Visits",
      "Create private invitation; maximum 24-hour window",
      "visits:request",
      ref("Visit"),
      visitCreateSchema,
    ),
  },
  "/api/visits/check/{code}": {
    get: operation(
      "Visits",
      "Staff lookup only; QR is identification, not authorization",
      "visits:control",
      ref("Visit"),
      undefined,
      [parameter("code", { type: "string", pattern: "^[a-f0-9]{64}$" })],
    ),
  },
  "/api/visits/{id}/check-in": {
    post: operation(
      "Visits",
      "Record entry after physical official-ID verification",
      "visits:control",
      ref("Visit"),
      visitEntrySchema,
      [parameter("id")],
    ),
  },
  "/api/visits/{id}/check-out": {
    post: operation(
      "Visits",
      "Record exit, including after invitation window expiry",
      "visits:control",
      ref("Visit"),
      visitActionSchema,
      [parameter("id")],
    ),
  },
  "/api/visits/{id}/cancel": {
    post: operation(
      "Visits",
      "Host or scoped manager cancels unused invitation",
      "visits:request",
      ref("Visit"),
      visitCancelSchema,
      [parameter("id")],
    ),
  },
  "/api/inventory/locations": {
    get: operation(
      "Inventory",
      "Scoped active locations, maximum 100",
      "inventory:read",
      { type: "array", items: { type: "object" } },
    ),
    post: operation(
      "Inventory",
      "Create scoped location",
      "inventory:manage",
      { type: "object" },
      locationCreateSchema,
    ),
  },
  "/api/inventory/items": {
    get: operation(
      "Inventory",
      "Scoped catalogue and exact ledger stock",
      "inventory:read",
      page(ref("InventoryItem")),
      undefined,
      query(inventoryQuerySchema),
    ),
    post: operation(
      "Inventory",
      "Consumable starts at zero; asset creates immutable entry of one unit",
      "inventory:manage",
      ref("InventoryItem"),
      itemCreateSchema,
    ),
  },
  "/api/inventory/items/{id}/movements": {
    get: operation(
      "Inventory",
      "Append-only ledger and aggregate balance",
      "inventory:read",
      {
        ...page({ type: "object" }),
        properties: {
          ...page({ type: "object" }).properties,
          ledgerBalance: { type: "string" },
        },
      },
      undefined,
      [parameter("id"), ...query(inventoryQuerySchema)],
    ),
  },
  "/api/inventory/movements": {
    post: operation(
      "Inventory",
      "Consumable signed ledger delta; never negative stock; adjustment is a delta, not overwrite",
      "inventory:manage",
      {
        type: "object",
        properties: {
          movement: { type: "object" },
          cantidadStock: { type: "string" },
          version: { type: "integer" },
        },
      },
      movementSchema,
    ),
  },
  "/api/inventory/loans": {
    get: operation(
      "Inventory",
      "Scoped loans, borrower and overdue filters",
      "inventory:read",
      page({ type: "object" }),
      undefined,
      query(loansQuerySchema),
    ),
    post: operation(
      "Inventory",
      "Atomically lend available asset to active scoped borrower",
      "inventory:loan",
      { type: "object" },
      loanSchema,
    ),
  },
  "/api/inventory/loans/{id}/return": {
    post: operation(
      "Inventory",
      "Return once with physical condition; immutable +1 ledger entry",
      "inventory:loan",
      { type: "object" },
      returnSchema,
      [parameter("id")],
    ),
  },
  "/api/operations/jobs/{id}/retry": {
    post: operation(
      "Operations",
      "Advance scheduled retry only; preserve attempts and worker ownership",
      "operations:manage",
      {
        type: "object",
        properties: {
          id,
          state: { const: "RETRY_SCHEDULED" },
          attempts: { type: "integer" },
          retryRequested: { const: true },
        },
      },
      retryJobSchema,
      [parameter("id")],
    ),
  },
};
