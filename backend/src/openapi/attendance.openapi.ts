const id = { type: "integer", minimum: 1 };
const seconds = { type: "integer", minimum: 0 };
const date = { type: "string", format: "date-time" };
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, object>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const attendance = object({
  id,
  userId: id,
  user: object({ codigo: { type: "string" } }),
  sedeId: id,
  areaId: id,
  turnoId: id,
  checkInAt: date,
  checkOutAt: nullable(date),
  durationSeconds: nullable(seconds),
  status: { enum: ["ABIERTA", "PENDIENTE", "AUTORIZADA", "RECHAZADA"] },
  closeReason: nullable({ type: "string" }),
  closedById: nullable(id),
  abnormal: { type: "boolean" },
  version: id,
  requiresReview: { type: "boolean" },
  isContingency: { type: "boolean" },
  locationRiskCode: nullable({ type: "string" }),
  risk: object({
    color: { enum: ["VERDE", "AMARILLO", "ROJO"] },
    reasons: { type: "array", items: { type: "string" } },
    policyVersion: { type: "integer", minimum: 0 },
  }),
});
const page = {
  items: { type: "array", items: ref("Attendance") },
  nextCursor: nullable(id),
  serverTime: date,
  timeZone: { type: "string" },
  abnormalAfterSeconds: seconds,
};
export const attendanceSchemas = {
  Attendance: attendance,
  AttendancePage: object(page),
  AttendanceMine: object({
    ...page,
    open: nullable(ref("Attendance")),
    bank: object({
      pendingSeconds: seconds,
      authorizedSeconds: seconds,
      rejectedSeconds: seconds,
    }),
  }),
};
const success = (name: string) => ({
  description: "Successful operation",
  content: { "application/json": { schema: object({ data: ref(name) }) } },
});
const errors = {
  400: {
    description:
      "VALIDATION_ERROR: invalid body, cursor or missing/invalid Idempotency-Key",
  },
  401: { description: "UNAUTHORIZED: active authenticated session required" },
  403: { description: "FORBIDDEN: operation outside the actor's scope" },
  404: { description: "ATTENDANCE_NOT_FOUND" },
  409: {
    description:
      "ATTENDANCE_ALREADY_OPEN, ATTENDANCE_NOT_OPEN, ATTENDANCE_ASSIGNMENT_REQUIRED, IDEMPOTENCY_KEY_REUSED, ATTENDANCE_CLOCK_ERROR or ATTENDANCE_RETRY_REQUIRED",
  },
};
const common = { tags: ["Attendance"], security: [{ cookieAuth: [] }] };
const pagination = [
  {
    name: "cursor",
    in: "query",
    schema: id,
    description: "Exclusive id cursor, descending order",
  },
  { name: "limit", in: "query", schema: { ...id, maximum: 100, default: 20 } },
];
const keyParameter = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", pattern: "^[A-Za-z0-9_-]{16,100}$" },
  description:
    "Unique per actor and operation; reuse for retries of the same payload. Keys are retained; a different payload returns 409.",
};
const mutation = (body: object) => ({
  ...common,
  parameters: [keyParameter],
  requestBody: {
    required: true,
    content: { "application/json": { schema: body } },
  },
  responses: { 200: success("Attendance"), ...errors },
});
export const attendancePaths = {
  "/api/attendance/review": {
    get: {
      ...common,
      summary: "Scoped closed attendance review queue",
      parameters: [
        ...pagination,
        {
          name: "status",
          in: "query",
          schema: {
            enum: ["PENDIENTE", "AUTORIZADA", "RECHAZADA"],
            default: "PENDIENTE",
          },
        },
        ...["userId", "sedeId", "areaId"].map((name) => ({
          name,
          in: "query",
          schema: id,
        })),
      ],
      responses: {
        200: { description: "Items, freshly evaluated risk and nextCursor" },
        ...errors,
      },
    },
  },
  "/api/attendance/{id}/history": {
    get: {
      ...common,
      summary: "Private append-only correction and validation history",
      parameters: [{ name: "id", in: "path", required: true, schema: id }],
      responses: { 200: { description: "Events and validations" }, ...errors },
    },
  },
  "/api/attendance/{id}/validate": {
    post: {
      ...mutation(
        object({
          version: id,
          decision: { enum: ["AUTORIZADA", "RECHAZADA"] },
          reason: { type: "string", minLength: 5, maxLength: 500 },
        }),
      ),
      parameters: [
        keyParameter,
        { name: "id", in: "path", required: true, schema: id },
      ],
      summary: "Individual final decision by authorized authority",
      description:
        "No self-validation or final validation by a corrector. A current pending version is mandatory. Omitted checkout must be corrected before authorization.",
      responses: {
        201: { description: "Confirmed attendance decision" },
        ...errors,
      },
    },
  },
  "/api/attendance/{id}/correct": {
    post: {
      ...mutation(
        object({
          version: id,
          checkInAt: date,
          checkOutAt: date,
          reason: { type: "string", minLength: 5, maxLength: 500 },
        }),
      ),
      parameters: [
        keyParameter,
        { name: "id", in: "path", required: true, schema: id },
      ],
      summary: "Append-only audited correction",
      description:
        "Pending records only, same Mexico day, no future or overlapping intervals. Preserves at least yellow risk.",
      responses: {
        201: { description: "Confirmed corrected attendance" },
        ...errors,
      },
    },
  },
  "/api/attendance/validate-batch": {
    post: {
      ...mutation(
        object({
          items: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: object({ id, version: id }),
          },
          reason: { type: "string", minLength: 5, maxLength: 500 },
        }),
      ),
      summary: "Atomically authorize up to 100 distinct green pending records",
      description:
        "Rechecks version, risk, scope and separation of duties under locks. No bulk rejection or correction.",
      responses: { 201: { description: "All approved items" }, ...errors },
    },
  },
  "/api/attendance/policies/{sedeId}": {
    post: {
      ...common,
      summary: "Publish a new immutable risk policy for a sede",
      parameters: [{ name: "sedeId", in: "path", required: true, schema: id }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              ...object({
                rules: object({
                  redBelowSeconds: seconds,
                  greenFromSeconds: seconds,
                  greenUntilSeconds: seconds,
                  redAboveSeconds: seconds,
                }),
                reason: { type: "string", minLength: 5, maxLength: 500 },
              }),
              properties: {
                ...object({
                  rules: object({
                    redBelowSeconds: seconds,
                    greenFromSeconds: seconds,
                    greenUntilSeconds: seconds,
                    redAboveSeconds: seconds,
                  }),
                  reason: { type: "string", minLength: 5, maxLength: 500 },
                }).properties,
                locationRules: ref("AttendanceLocationPolicy"),
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "New policy version; historical snapshots unchanged",
        },
        ...errors,
      },
    },
  },
  "/api/attendance/me": {
    get: {
      ...common,
      summary: "Own history, current interval and hour bank",
      parameters: pagination,
      responses: { 200: success("AttendanceMine"), ...errors },
    },
  },
  "/api/attendance/open": {
    get: {
      ...common,
      summary: "Open intervals within the management scope",
      description:
        "Coordinador/Jefe de área: area; Jefe de sede: sede; Jefe de coordinadores/Admin: global. Organization assignment is the snapshot taken at check-in.",
      parameters: pagination,
      responses: { 200: success("AttendancePage"), ...errors },
    },
  },
  "/api/attendance/check-in": {
    post: {
      ...mutation({
        type: "object",
        additionalProperties: false,
        properties: {
          coords: {
            description:
              "Optional advisory evidence; missing or malformed coordinates never block attendance",
            anyOf: [ref("Coordinates"), {}],
          },
        },
      }),
      summary: "Start an interval at server time",
      description:
        "Requires active and consistent sede, area and non-overnight turno. Captures immutable shift and policy snapshots. Check-in outside the shift is advisory, not blocked. At 23:59 Mexico time the day is closed.",
    },
  },
  "/api/attendance/check-out": {
    post: {
      ...mutation({
        ...object({ attendanceId: id }),
        properties: {
          attendanceId: id,
          coords: {
            description:
              "Optional advisory evidence; uses the immutable check-in policy",
            anyOf: [ref("Coordinates"), {}],
          },
        },
      }),
      summary: "Close an owned interval at server time",
      description:
        "Returns duration in whole seconds, advisory risk and PENDIENTE. Daily cutoff is 23:59 America/Mexico_City. Never approves hours automatically.",
    },
  },
  "/api/attendance/{id}/close": {
    post: {
      ...mutation(
        object({ reason: { type: "string", minLength: 5, maxLength: 500 } }),
      ),
      summary: "Audited manual close within management scope",
      parameters: [
        keyParameter,
        { name: "id", in: "path", required: true, schema: id },
      ],
      description:
        "Same scope as GET /attendance/open. Records actor, timestamp and trimmed reason atomically. Closing never authorizes hours.",
    },
  },
};
