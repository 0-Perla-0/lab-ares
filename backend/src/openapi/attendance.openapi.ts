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
      ...mutation(object({})),
      summary: "Start an interval at server time",
      description:
        "Requires active and consistent sede, area and turno. Only one open interval per user. Does not enforce day, time, GPS or IP.",
    },
  },
  "/api/attendance/check-out": {
    post: {
      ...mutation(object({ attendanceId: id })),
      summary: "Close an owned interval at server time",
      description:
        "Returns duration in whole seconds and PENDIENTE. Overnight intervals are allowed. Never approves hours automatically.",
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
