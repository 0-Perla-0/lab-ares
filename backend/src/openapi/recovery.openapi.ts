const security = [{ cookieAuth: [] }];
const errors = {
  400: { description: "Invalid request or Idempotency-Key" },
  401: { description: "Authentication required" },
  403: { description: "GLOBAL permission or separation of duties required" },
  404: { description: "Recovery run not found" },
  409: {
    description: "Invalid state, stale preview, lease, or integrity conflict",
  },
  503: { description: "Write barrier or dependency unavailable" },
};
const id = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", minLength: 1, maxLength: 30 },
};
const idempotency = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: {
    type: "string",
    minLength: 16,
    maxLength: 128,
    pattern: "^[A-Za-z0-9._:-]+$",
  },
};
const body = (schema: object) => ({
  required: true,
  content: { "application/json": { schema } },
});
const mutation = (
  description: string,
  schema?: object,
  permission = "RECOVERY_EXECUTE",
) => ({
  tags: ["Recovery"],
  security,
  parameters: [id, idempotency],
  description: `${description} Requires ${permission} with GLOBAL scope.`,
  ...(schema ? { requestBody: body(schema) } : {}),
  responses: { 200: { description: "Governed recovery result" }, ...errors },
});

export const recoveryPaths = {
  "/api/recovery/status": {
    get: {
      tags: ["Recovery"],
      security,
      description: "Returns the global write-barrier snapshot and owning run.",
      responses: {
        200: { description: "Recovery control-plane status" },
        ...errors,
      },
    },
  },
  "/api/recovery/drills": {
    get: {
      tags: ["Recovery"],
      security,
      description: "Lists drill outcomes and measured RPO/RTO values.",
      responses: { 200: { description: "Recovery drill history" }, ...errors },
    },
  },
  "/api/recovery": {
    get: {
      tags: ["Recovery"],
      security,
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
        {
          name: "pageSize",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 100 },
        },
        { name: "state", in: "query", schema: { type: "string" } },
        {
          name: "scope",
          in: "query",
          schema: { enum: ["IMPORTANTE", "SECUNDARIO"] },
        },
      ],
      responses: { 200: { description: "Paginated recovery runs" }, ...errors },
    },
    post: {
      tags: ["Recovery"],
      security,
      parameters: [idempotency],
      description:
        "Creates a governed plan; it never invokes provider PITR or destructive restore APIs.",
      requestBody: body({ $ref: "#/components/schemas/RecoveryCreateInput" }),
      responses: { 201: { description: "Recovery plan created" }, ...errors },
    },
  },
  "/api/recovery/{id}": {
    get: {
      tags: ["Recovery"],
      security,
      parameters: [id],
      responses: {
        200: {
          description:
            "Run, steps, checks, reconciliations, and imported journal fingerprints",
        },
        ...errors,
      },
    },
  },
  "/api/recovery/{id}/freeze": {
    post: mutation(
      "Activates the durable global write barrier.",
      { $ref: "#/components/schemas/RecoveryFreezeInput" },
      "RECOVERY_MANAGE",
    ),
  },
  "/api/recovery/{id}/restore": {
    post: mutation(
      "Records externally performed restore evidence; the API does not execute the restore.",
      { $ref: "#/components/schemas/RecoveryRestoreInput" },
      "RECOVERY_MANAGE",
    ),
  },
  "/api/recovery/{id}/reconciliation/preview": {
    post: mutation(
      "Creates a mandatory side-effect-free reconciliation preview.",
      { $ref: "#/components/schemas/RecoveryLimitInput" },
    ),
  },
  "/api/recovery/{id}/reconciliation/execute": {
    post: mutation(
      "Executes only the latest matching preview while the owning barrier version remains active.",
      { $ref: "#/components/schemas/RecoveryLimitInput" },
    ),
  },
  "/api/recovery/{id}/audit/verify": {
    post: mutation(
      "Verifies the private audit manifest before journal import.",
      {
        type: "object",
        additionalProperties: false,
        properties: { period: { type: "string", format: "date" } },
      },
    ),
  },
  "/api/recovery/{id}/journal/import": {
    post: mutation(
      "Imports post-restore suppression envelopes after checking sequence, chain, hashes, key version, and HMAC.",
      { $ref: "#/components/schemas/RecoveryJournalImportInput" },
    ),
  },
  "/api/recovery/{id}/suppressions/reapply": {
    post: mutation(
      "Reapplies only verified imported suppressions without exposing raw resource identifiers.",
      { $ref: "#/components/schemas/RecoveryLimitInput" },
    ),
  },
  "/api/recovery/{id}/approve-ready": {
    post: mutation(
      "Records independent readiness approval after dependency and queue checks.",
      undefined,
      "RECOVERY_MANAGE",
    ),
  },
  "/api/recovery/{id}/unfreeze": {
    post: mutation(
      "Releases the write barrier after readiness approval and separation of duties.",
    ),
  },
  "/api/recovery/{id}/complete": {
    post: mutation(
      "Completes an unfrozen run and records optional drill outcome.",
      { $ref: "#/components/schemas/RecoveryCompleteInput" },
      "RECOVERY_MANAGE",
    ),
  },
  "/api/recovery/{id}/fail": {
    post: mutation(
      "Marks a non-terminal run failed; it does not implicitly unfreeze.",
      { $ref: "#/components/schemas/RecoveryReasonInput" },
      "RECOVERY_MANAGE",
    ),
  },
  "/api/recovery/{id}/cancel": {
    post: mutation(
      "Cancels a non-terminal run; it does not implicitly unfreeze.",
      { $ref: "#/components/schemas/RecoveryReasonInput" },
      "RECOVERY_MANAGE",
    ),
  },
} as const;

export const recoverySchemas = {
  RecoveryCreateInput: {
    type: "object",
    required: ["name", "scope", "responsibleId"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 191 },
      scope: { enum: ["IMPORTANTE", "SECUNDARIO"] },
      responsibleId: { type: "integer", minimum: 1 },
      isDrill: { type: "boolean", default: false },
    },
  },
  RecoveryFreezeInput: {
    type: "object",
    required: ["reasonCode"],
    additionalProperties: false,
    properties: {
      reasonCode: { type: "string", pattern: "^[A-Z0-9_:-]+$", maxLength: 100 },
    },
  },
  RecoveryRestoreInput: {
    type: "object",
    required: ["restorePoint", "imageVersion"],
    additionalProperties: false,
    properties: {
      restorePoint: { type: "string", format: "date-time" },
      imageVersion: { type: "string", maxLength: 191 },
      externalProviderRef: { type: "string", maxLength: 191 },
      actualRpoMinutes: { type: "integer", minimum: 0 },
      actualRtoMinutes: { type: "integer", minimum: 0 },
    },
  },
  RecoveryLimitInput: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
    },
  },
  RecoveryJournalImportInput: {
    type: "object",
    required: ["entries"],
    additionalProperties: false,
    properties: {
      entries: {
        type: "array",
        minItems: 1,
        maxItems: 1000,
        items: { type: "object", additionalProperties: false },
      },
    },
  },
  RecoveryCompleteInput: {
    type: "object",
    additionalProperties: false,
    properties: {
      drillResult: { enum: ["PASSED", "PARTIAL", "FAILED"] },
      drillNotes: { type: "string", maxLength: 1000 },
    },
  },
  RecoveryReasonInput: {
    type: "object",
    required: ["reason"],
    additionalProperties: false,
    properties: { reason: { type: "string", minLength: 1, maxLength: 500 } },
  },
} as const;
