import { featureKeys } from "../common/domain/feature-policies.service";
const secured = { security: [{ cookieAuth: [] }] };
const key = {
  name: "idempotency-key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 8, maxLength: 100 },
};
const json = (schema: object) => ({
  required: true,
  content: { "application/json": { schema } },
});
const errors = {
  401: { description: "Authentication required" },
  403: {
    description:
      "Scope/role denied or REAUTH_REQUIRED; confirm via /auth/reauthenticate and explicitly resend",
  },
  404: { description: "Resource unavailable or outside enabled feature scope" },
  409: {
    description:
      "Version changed, idempotency conflict or recovery-account state",
  },
  422: { description: "Invalid contract" },
  429: { description: "Shared account/network throttle; Retry-After seconds" },
  503: { description: "Governed write barrier" },
};
export const fullClosurePaths = {
  "/api/auth/reauthenticate": {
    post: {
      ...secured,
      tags: ["Authentication"],
      description:
        "Confirm password without MFA or a fresh TOTP with MFA. Server-only 15-minute assurance, no privilege elevation or implicit operation replay.",
      requestBody: json({
        type: "object",
        additionalProperties: false,
        properties: {
          password: { type: "string", writeOnly: true, maxLength: 128 },
          code: { type: "string", writeOnly: true, pattern: "^\\d{6}$" },
        },
      }),
      responses: {
        201: { description: "Confirmation stored in the current session" },
        ...errors,
      },
    },
  },
  "/api/users/{id}/recovery": {
    post: {
      ...secured,
      tags: ["Users"],
      description:
        "USERS_MANAGE with current scope/role and recent authentication. Another institutional authority verifies identity; active accounts only. Revokes sessions/challenges and optionally MFA, sends encrypted-token recovery email. No password assignment or raw token in response/replay.",
      parameters: [
        key,
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer", minimum: 1 },
        },
      ],
      requestBody: json({
        type: "object",
        additionalProperties: false,
        required: ["identityVerified", "ticket", "reason"],
        properties: {
          identityVerified: { type: "boolean", const: true },
          ticket: { type: "string", minLength: 3, maxLength: 100 },
          reason: { type: "string", minLength: 10, maxLength: 500 },
          email: { type: "string", format: "email", maxLength: 191 },
          resetMfa: { type: "boolean", default: false },
        },
      }),
      responses: {
        201: { description: "Administrative recovery committed once" },
        ...errors,
      },
    },
  },
  "/api/operations/feature-policies": {
    get: {
      ...secured,
      tags: ["Operations"],
      responses: {
        200: {
          description:
            "Current versioned policy scopes, never secrets; OPERATIONS_READ",
        },
        ...errors,
      },
    },
  },
  "/api/operations/feature-policies/{key}": {
    post: {
      ...secured,
      tags: ["Operations"],
      description:
        "OPERATIONS_MANAGE global, recent authentication and durable idempotency. Version 0 means no persisted policy. Configuration remains the hard ceiling; empty ID lists add no further restriction. Existing exits/returns/cancellations are not disabled.",
      parameters: [
        key,
        {
          name: "key",
          in: "path",
          required: true,
          schema: { enum: featureKeys },
        },
      ],
      requestBody: json({
        type: "object",
        additionalProperties: false,
        required: [
          "expectedVersion",
          "enabled",
          "sedeIds",
          "areaIds",
          "userIds",
          "reason",
        ],
        properties: {
          expectedVersion: { type: "integer", minimum: 0 },
          enabled: { type: "boolean" },
          ...Object.fromEntries(
            ["sedeIds", "areaIds", "userIds"].map((name) => [
              name,
              {
                type: "array",
                maxItems: 500,
                items: { type: "integer", minimum: 1 },
              },
            ]),
          ),
          reason: { type: "string", minLength: 10, maxLength: 500 },
        },
      }),
      responses: {
        201: {
          description: "Policy version published and audited transactionally",
        },
        ...errors,
      },
    },
  },
  "/api/operations/queues": {
    get: {
      ...secured,
      tags: ["Operations"],
      responses: {
        200: {
          description:
            "Per-state counts, oldest creation age and expired leases; not proof of email delivery. OPERATIONS_READ; no job payloads or raw identity keys.",
        },
        ...errors,
      },
    },
  },
};
