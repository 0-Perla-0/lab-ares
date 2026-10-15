import { z } from "zod";
import {
  absenceQuerySchema,
  appealResolutionSchema,
  appealSchema,
  justificationSchema,
  resolutionSchema,
} from "../absences/absences.schemas";
import {
  calendarQuerySchema,
  createExceptionSchema,
  exceptionSchema,
  revokeExceptionSchema,
} from "../calendar/calendar.schemas";
const security = [{ cookieAuth: [] }];
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  return JSON.parse(JSON.stringify(z.toJSONSchema(schema)));
}
const key = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: {
    type: "string",
    minLength: 16,
    maxLength: 100,
    pattern: "^[A-Za-z0-9_-]{16,100}$",
  },
  description:
    "Same key and payload replay the persisted response. A changed payload returns 409.",
};
const id = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^c[a-z0-9]{20,29}$" },
};
const errors = {
  400: { description: "Strict validation error" },
  401: { description: "Active session required" },
  403: { description: "Scope/ownership/independent authority denied" },
  404: { description: "Resource not found" },
  409: {
    description:
      "Stale version, invalid state, deadline, evidence or idempotency conflict",
  },
  503: { description: "Durable recovery barrier active (fail closed)" },
};
function body(name: string) {
  return {
    required: true,
    content: {
      "application/json": { schema: { $ref: `#/components/schemas/${name}` } },
    },
  };
}
function response(name: string) {
  return {
    description: "Confirmed server response",
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["data"],
          properties: { data: { $ref: `#/components/schemas/${name}` } },
        },
      },
    },
  };
}
function query(schema: z.ZodType) {
  const json = jsonSchema(schema);
  return Object.entries((json.properties ?? {}) as Record<string, unknown>).map(
    ([name, value]) => ({
      name,
      in: "query",
      required:
        (json.required as string[] | undefined)?.includes(name) ?? false,
      schema: value,
    }),
  );
}
function mutation(
  tag: string,
  summary: string,
  input: string,
  output = "Absence",
  parameters: object[] = [id],
) {
  return {
    tags: [tag],
    summary,
    security,
    parameters: [...parameters, key],
    requestBody: body(input),
    responses: { 201: response(output), ...errors },
  };
}
export const absenceCalendarPaths = {
  "/api/absences/me": {
    get: {
      tags: ["Absences"],
      summary:
        "Own private absence history and server-calculated business-day deadlines",
      security,
      parameters: query(absenceQuerySchema),
      responses: { 200: response("AbsencePage"), ...errors },
    },
  },
  "/api/absences/queue": {
    get: {
      tags: ["Absences"],
      summary: "Scoped review queue: AREA/SEDE/GLOBAL snapshot ownership",
      security,
      parameters: query(absenceQuerySchema),
      responses: { 200: response("AbsencePage"), ...errors },
    },
  },
  "/api/absences/{id}/justify": {
    post: mutation(
      "Absences",
      "Submit private justification or requested clarification within 5/2 business days; clean owned PDF/JPG/PNG only",
      "AbsenceJustificationInput",
    ),
  },
  "/api/absences/{id}/resolve": {
    post: mutation(
      "Absences",
      "Accept, request 2-day clarification or reject with a 3-day appeal window; self-resolution denied",
      "AbsenceResolutionInput",
    ),
  },
  "/api/absences/{id}/appeal": {
    post: mutation(
      "Absences",
      "Submit the single ordinary appeal within 3 business days",
      "AbsenceAppealInput",
    ),
  },
  "/api/absences/{id}/resolve-appeal": {
    post: mutation(
      "Absences",
      "Final appeal resolution by a distinct, non-junior authority",
      "AbsenceAppealResolutionInput",
    ),
  },
  "/api/absences/{id}/evidence/{archivoId}/download": {
    get: {
      tags: ["Absences"],
      summary: "Scoped private evidence capability; 300-second signed URL",
      security,
      parameters: [
        id,
        {
          name: "archivoId",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^[a-f0-9]{30}$" },
        },
      ],
      responses: {
        200: {
          description: "Signed private download URL",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["data"],
                properties: { data: { type: "string", format: "uri" } },
              },
            },
          },
        },
        ...errors,
      },
    },
  },
  "/api/calendar/events": {
    get: {
      tags: ["Calendar"],
      summary:
        "Scoped exceptions and own shift; inclusive civil date range, maximum 367 days/500 events",
      security,
      parameters: query(calendarQuerySchema),
      responses: { 200: response("CalendarEventsResponse"), ...errors },
    },
  },
  "/api/calendar/exceptions/preview": {
    post: mutation(
      "Calendar",
      "Durable 15-minute exact-impact dry-run; no hours are changed",
      "CalendarExceptionInput",
      "CalendarImpactPreview",
      [],
    ),
  },
  "/api/calendar/exceptions": {
    post: mutation(
      "Calendar",
      "Create exception: USUARIO > AREA > SEDE > GLOBAL > shift; same scope newest wins. Today/past require preview; definitive absences require ADMIN confirmation. No equivalent hours.",
      "CalendarCreateInput",
      "CalendarException",
      [],
    ),
  },
  "/api/calendar/exceptions/{id}/revoke-preview": {
    post: mutation(
      "Calendar",
      "Dry-run logical revocation; historical absences are not resurrected",
      "CalendarEmptyInput",
      "CalendarImpactPreview",
    ),
  },
  "/api/calendar/exceptions/{id}": {
    delete: mutation(
      "Calendar",
      "Audited logical revocation with mandatory reason; today/past require exact preview",
      "CalendarRevokeInput",
      "CalendarException",
    ),
  },
};
const nullableDate = { type: ["string", "null"], format: "date-time" };
export const absenceCalendarSchemas = {
  AbsenceJustificationInput: jsonSchema(justificationSchema),
  AbsenceAppealInput: jsonSchema(appealSchema),
  AbsenceResolutionInput: jsonSchema(resolutionSchema),
  AbsenceAppealResolutionInput: jsonSchema(appealResolutionSchema),
  CalendarExceptionInput: jsonSchema(exceptionSchema),
  CalendarCreateInput: jsonSchema(createExceptionSchema),
  CalendarRevokeInput: jsonSchema(revokeExceptionSchema),
  CalendarEmptyInput: { type: "object", additionalProperties: false },
  Absence: {
    type: "object",
    required: ["id", "userId", "estado", "version", "plazoLimiteAt"],
    properties: {
      id: { type: "string" },
      userId: { type: "integer" },
      sedeId: { type: "integer" },
      areaId: { type: "integer" },
      turnoId: { type: "integer" },
      fecha: { type: "string", format: "date-time" },
      estado: {
        type: "string",
        enum: [
          "PENDIENTE_JUSTIFICACION",
          "JUSTIFICACION_ENVIADA",
          "EN_ACLARACION",
          "JUSTIFICADA",
          "NO_JUSTIFICADA",
          "EN_APELACION",
          "CANCELADA",
        ],
      },
      tipo: { type: "string" },
      version: { type: "integer" },
      plazoLimiteAt: { type: "string", format: "date-time" },
      aclaracionLimiteAt: nullableDate,
      apelacionLimiteAt: nullableDate,
      businessDaysRemaining: { type: ["integer", "null"] },
      motivoResolucion: { type: ["string", "null"] },
      justificaciones: { type: "array", items: { type: "object" } },
      apelacion: { type: ["object", "null"] },
    },
  },
  AbsencePage: {
    type: "object",
    required: ["items", "nextCursor", "serverTime", "timeZone"],
    properties: {
      items: { type: "array", items: { $ref: "#/components/schemas/Absence" } },
      nextCursor: { type: ["string", "null"] },
      serverTime: { type: "string", format: "date-time" },
      timeZone: { const: "America/Mexico_City" },
    },
  },
  CalendarException: {
    type: "object",
    properties: {
      id: { type: "string" },
      titulo: { type: "string" },
      alcance: { enum: ["GLOBAL", "SEDE", "AREA", "USUARIO"] },
      efecto: {
        enum: [
          "SUSPENSION_ACTIVIDADES",
          "HORARIO_ESPECIAL",
          "ASISTENCIA_EXTRAORDINARIA",
          "PERMISO_PROGRAMADO",
        ],
      },
      fechaInicio: { type: "string", format: "date-time" },
      fechaFin: { type: "string", format: "date-time" },
      revokedAt: nullableDate,
    },
  },
  CalendarEventsResponse: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: { $ref: "#/components/schemas/CalendarException" },
      },
      shift: { type: ["object", "null"] },
    },
  },
  CalendarImpactPreview: {
    type: "object",
    required: [
      "previewId",
      "expiresAt",
      "users",
      "attendances",
      "absences",
      "definitive",
    ],
    properties: {
      previewId: { type: "string" },
      expiresAt: { type: "string", format: "date-time" },
      users: { type: "integer" },
      attendances: { type: "integer" },
      absences: { type: "integer" },
      definitive: { type: "integer" },
    },
  },
};
