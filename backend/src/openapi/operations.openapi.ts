const security = [{ cookieAuth: [] }];
const errors = {
  400: { description: "Invalid request" },
  401: { description: "Authentication required" },
  403: { description: "Insufficient permission or scope" },
  404: { description: "Resource not found" },
  409: { description: "State, lease, or integrity conflict" },
};
const jsonBody = (schema: object) => ({
  required: true,
  content: { "application/json": { schema } },
});
const id = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", minLength: 1, maxLength: 30 },
};
const period = {
  name: "period",
  in: "path",
  required: true,
  schema: { type: "string", format: "date" },
};
const paging = [
  {
    name: "page",
    in: "query",
    schema: { type: "integer", minimum: 1, default: 1 },
  },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
  },
];
const auditFilters = [
  ...paging,
  {
    name: "from",
    in: "query",
    schema: { type: "string", format: "date-time" },
  },
  { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
  { name: "actorId", in: "query", schema: { type: "integer", minimum: 1 } },
  { name: "subjectId", in: "query", schema: { type: "integer", minimum: 1 } },
  { name: "module", in: "query", schema: { type: "string", maxLength: 60 } },
  { name: "action", in: "query", schema: { type: "string", maxLength: 100 } },
  {
    name: "objectType",
    in: "query",
    schema: { type: "string", maxLength: 100 },
  },
  { name: "objectId", in: "query", schema: { type: "string", maxLength: 100 } },
  {
    name: "result",
    in: "query",
    schema: { enum: ["SUCCESS", "DENIED", "FAILED"] },
  },
  { name: "sedeId", in: "query", schema: { type: "integer", minimum: 1 } },
  { name: "areaId", in: "query", schema: { type: "integer", minimum: 1 } },
  {
    name: "correlationId",
    in: "query",
    schema: { type: "string", minLength: 8, maxLength: 100 },
  },
];

export const operationsPaths = {
  "/api/audit/me": {
    get: {
      tags: ["Audit"],
      security,
      parameters: auditFilters,
      description:
        "Limited actor/subject audit view for the authenticated user; actorId/subjectId filters cannot expand self scope.",
      responses: {
        200: { description: "Paginated self audit events" },
        ...errors,
      },
    },
  },
  "/api/audit/events": {
    get: {
      tags: ["Audit"],
      security,
      parameters: auditFilters,
      description:
        "Scope-limited audit search. AREA and SEDE grants are always constrained by the authenticated actor.",
      responses: { 200: { description: "Paginated audit events" }, ...errors },
    },
  },
  "/api/audit/export": {
    get: {
      tags: ["Audit"],
      security,
      parameters: auditFilters,
      description:
        "Scope-limited CSV export capped at 10,000 rows. The export is itself audited.",
      responses: {
        200: {
          description: "Audit CSV",
          content: { "text/csv": { schema: { type: "string" } } },
        },
        ...errors,
      },
    },
  },
  "/api/audit/manifests/{period}": {
    post: {
      tags: ["Audit"],
      security,
      parameters: [period],
      description:
        "GLOBAL-only immutable daily integrity manifest for a closed UTC period. It is an integrity anchor, not a legal signature.",
      responses: {
        201: {
          description:
            "Private manifest created and anchored in private object storage",
        },
        ...errors,
      },
    },
  },
  "/api/audit/manifests/{period}/verify": {
    get: {
      tags: ["Audit"],
      security,
      parameters: [period],
      description:
        "Verifies chain continuity, event hashes, row count, database manifest and private stored anchor.",
      responses: {
        200: { description: "Integrity verification result" },
        ...errors,
      },
    },
  },
  "/api/operations/status": {
    get: {
      tags: ["Operations"],
      security,
      description:
        "GLOBAL operations view with independently attributed database, storage, and scanner health plus job/alert/incident metrics.",
      responses: { 200: { description: "Operational status" }, ...errors },
    },
  },
  "/api/operations/jobs": {
    get: {
      tags: ["Operations"],
      security,
      parameters: paging,
      responses: {
        200: {
          description: "Jobs without payload, result, or lease-owner secrets",
        },
        ...errors,
      },
    },
    post: {
      tags: ["Operations"],
      security,
      requestBody: jsonBody({
        $ref: "#/components/schemas/OperationalJobInput",
      }),
      responses: {
        201: { description: "Idempotently ensured durable job" },
        ...errors,
      },
    },
  },
  "/api/operations/jobs/{id}/claim": {
    post: {
      tags: ["Operations"],
      security,
      parameters: [id],
      requestBody: jsonBody({
        type: "object",
        additionalProperties: false,
        properties: {
          leaseMs: { type: "integer", minimum: 10000, maximum: 3600000 },
        },
      }),
      responses: {
        201: {
          description:
            "Job lease claimed with owner derived from the authenticated actor",
        },
        ...errors,
      },
    },
  },
  "/api/operations/jobs/{id}/complete": {
    post: {
      tags: ["Operations"],
      security,
      parameters: [id],
      requestBody: jsonBody({
        type: "object",
        additionalProperties: false,
        properties: {
          result: {
            type: "object",
            description: "Secret-bearing keys are rejected",
          },
        },
      }),
      responses: {
        201: { description: "Job completed under active lease CAS" },
        ...errors,
      },
    },
  },
  "/api/operations/jobs/{id}/fail": {
    post: {
      tags: ["Operations"],
      security,
      parameters: [id],
      requestBody: jsonBody({
        type: "object",
        required: ["errorCode"],
        additionalProperties: false,
        properties: { errorCode: { type: "string", maxLength: 100 } },
      }),
      responses: {
        201: { description: "Retry scheduled or terminal alert created" },
        ...errors,
      },
    },
  },
  "/api/operations/alerts": {
    get: {
      tags: ["Operations"],
      security,
      parameters: paging,
      responses: { 200: { description: "Operational alerts" }, ...errors },
    },
  },
  "/api/operations/alerts/{id}/acknowledge": {
    post: {
      tags: ["Operations"],
      security,
      parameters: [id],
      responses: {
        201: { description: "Alert acknowledged with CAS" },
        ...errors,
      },
    },
  },
  "/api/operations/alerts/{id}/resolve": {
    post: {
      tags: ["Operations"],
      security,
      parameters: [id],
      requestBody: jsonBody({
        type: "object",
        required: ["resolution"],
        additionalProperties: false,
        properties: { resolution: { type: "string", maxLength: 500 } },
      }),
      responses: { 201: { description: "Alert resolved" }, ...errors },
    },
  },
  "/api/operations/incidents": {
    get: {
      tags: ["Operations"],
      security,
      parameters: paging,
      responses: {
        200: { description: "Incidents with recent transition history" },
        ...errors,
      },
    },
    post: {
      tags: ["Operations"],
      security,
      requestBody: jsonBody({
        $ref: "#/components/schemas/OperationalIncidentInput",
      }),
      responses: {
        201: {
          description:
            "Incident reference created; this API does not implement ticketing",
        },
        ...errors,
      },
    },
  },
  "/api/operations/incidents/{id}": {
    patch: {
      tags: ["Operations"],
      security,
      parameters: [id],
      requestBody: jsonBody({
        $ref: "#/components/schemas/OperationalIncidentUpdate",
      }),
      responses: {
        200: {
          description: "Incident updated with durable transition history",
        },
        ...errors,
      },
    },
  },
} as const;

export const operationsSchemas = {
  OperationalJobInput: {
    type: "object",
    required: ["name", "idempotencyKey"],
    additionalProperties: false,
    properties: {
      name: { type: "string", maxLength: 100 },
      idempotencyKey: { type: "string", minLength: 8, maxLength: 191 },
      payload: {
        type: "object",
        description: "Secret-bearing keys are rejected",
      },
      maxAttempts: { type: "integer", minimum: 1, maximum: 20 },
    },
  },
  OperationalIncidentInput: {
    type: "object",
    required: ["externalTicketRef", "severity", "reason"],
    additionalProperties: false,
    properties: {
      externalTicketRef: { type: "string", maxLength: 191 },
      severity: { enum: ["S1", "S2", "S3", "S4"] },
      ownerId: { type: "integer", minimum: 1 },
      reason: { type: "string", maxLength: 1000 },
      repeatedS2: { type: "boolean", default: false },
      communications: {
        type: "array",
        maxItems: 100,
        items: { type: "object" },
      },
    },
  },
  OperationalIncidentUpdate: {
    type: "object",
    minProperties: 1,
    additionalProperties: false,
    properties: {
      state: {
        enum: [
          "ABIERTO",
          "RECONOCIDO",
          "INVESTIGANDO",
          "MITIGANDO",
          "MONITOREANDO",
          "RESUELTO",
          "CERRADO",
        ],
      },
      severity: { enum: ["S1", "S2", "S3", "S4"] },
      ownerId: { type: ["integer", "null"], minimum: 1 },
      reason: { type: "string", maxLength: 1000 },
      communications: {
        type: "array",
        maxItems: 100,
        items: { type: "object" },
      },
    },
    description:
      "State or severity changes require reason and ownerId. S1 and repeated S2 require a postmortem within two business days.",
  },
} as const;
