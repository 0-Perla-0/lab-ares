const cookieSecurity = [{ cookieAuth: [] }];
const auth = { tags: ["Authentication"], security: cookieSecurity };
const publicAuth = { tags: ["Authentication"], security: [] };
const json = (schema: object) => ({ required: true, content: { "application/json": { schema } } });
const response = (description: string, schema?: object) => ({ description, ...(schema ? { content: { "application/json": { schema } } } : {}) });
const errors = {
  400: response("Invalid request"), 401: response("Authentication required or invalid credentials"),
  403: response("Insufficient permissions"), 404: response("Resource not found"),
  409: response("Conflict"), 422: response("Validation failed"), 429: response("Rate limit exceeded"), 500: response("Unexpected server error"),
};
const data = (ref: string) => ({ type: "object", properties: { data: { $ref: `#/components/schemas/${ref}` } } });
const id = { name: "id", in: "path", required: true, schema: { type: "string", minLength: 1 } };
const page = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
];

export const identityPaths = {
  "/api/auth/recovery/request": { post: { ...publicAuth, requestBody: json({ $ref: "#/components/schemas/RecoveryRequest" }), responses: { 200: response("Recovery request accepted", data("RecoveryAccepted")), ...errors } } },
  "/api/auth/recovery/reset": { post: { ...publicAuth, requestBody: json({ $ref: "#/components/schemas/RecoveryReset" }), responses: { 200: response("Password reset", data("ActionResult")), ...errors } } },
  "/api/auth/password/change": { post: { ...auth, requestBody: json({ $ref: "#/components/schemas/PasswordChange" }), responses: { 200: response("Password changed", data("ActionResult")), ...errors } } },
  "/api/auth/sessions": { get: { ...auth, responses: { 200: response("Active sessions", data("SessionList")), ...errors } } },
  "/api/auth/sessions/others": { delete: { ...auth, responses: { 204: response("Other sessions revoked"), ...errors } } },
  "/api/auth/sessions/{id}": { delete: { ...auth, parameters: [id], responses: { 204: response("Session revoked"), ...errors } } },
  "/api/auth/mfa": { get: { ...auth, responses: { 200: response("MFA status", data("MfaStatus")), ...errors } } },
  "/api/auth/mfa/setup": { post: { ...auth, responses: { 200: response("MFA setup", data("MfaSetup")), ...errors } } },
  "/api/auth/mfa/enable": { post: { ...auth, requestBody: json({ $ref: "#/components/schemas/MfaCode" }), responses: { 200: response("MFA enabled", data("RecoveryCodes")), ...errors } } },
  "/api/auth/mfa/disable": { post: { ...auth, requestBody: json({ $ref: "#/components/schemas/MfaPasswordCode" }), responses: { 200: response("MFA disabled", data("ActionResult")), ...errors } } },
  "/api/auth/mfa/recovery-codes/regenerate": { post: { ...auth, requestBody: json({ $ref: "#/components/schemas/MfaPasswordCode" }), responses: { 200: response("Recovery codes regenerated", data("RecoveryCodes")), ...errors } } },
  "/api/auth/mfa/verify": { post: { ...publicAuth, requestBody: json({ $ref: "#/components/schemas/MfaChallengeCode" }), responses: { 200: response("MFA verified", data("Authenticated")), ...errors } } },
  "/api/auth/mfa/recovery": { post: { ...publicAuth, requestBody: json({ $ref: "#/components/schemas/MfaChallengeRecovery" }), responses: { 200: response("MFA recovery verified", data("Authenticated")), ...errors } } },
  "/api/invitations": { get: { ...auth, responses: { 200: response("Invitations", data("InvitationList")), ...errors } }, post: { ...auth, requestBody: json({ $ref: "#/components/schemas/InvitationCreate" }), responses: { 201: response("Invitation created", data("Invitation")), ...errors } } },
  "/api/invitations/{token}": { get: { ...publicAuth, parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }], responses: { 200: response("Invitation", data("Invitation")), ...errors } } },
  "/api/invitations/{token}/accept": { post: { ...publicAuth, parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }], requestBody: json({ $ref: "#/components/schemas/InvitationAccept" }), responses: { 201: response("Invitation accepted", data("User")), ...errors } } },
  "/api/invitations/{id}/revoke": { post: { ...auth, parameters: [id], responses: { 200: response("Invitation revoked", data("Invitation")), ...errors } } },
  "/api/notifications": { get: { ...auth, parameters: page, responses: { 200: response("Notifications", data("NotificationList")), ...errors } } },
  "/api/notifications/{id}/read": { patch: { ...auth, parameters: [id], responses: { 200: response("Notification marked read", data("ActionResult")), ...errors } } },
  "/api/notifications/read-all": { post: { ...auth, responses: { 200: response("Notifications marked read", data("ActionResult")), ...errors } } },
} as const;

const secret = (description: string, minLength = 1) => ({ type: "string", minLength, maxLength: 128, writeOnly: true, description });
export const identitySchemas = {
  User: { type: "object", properties: { id: { type: "integer" }, codigo: { type: "string" }, email: { type: "string", format: "email" }, rol: { type: "string" }, estado: { type: "string" } } },
  LoginResponse: { oneOf: [{ $ref: "#/components/schemas/User" }, { $ref: "#/components/schemas/MfaChallenge" }] },
  MfaChallenge: { type: "object", required: ["mfaRequired", "challenge", "expiresIn"], properties: { mfaRequired: { type: "boolean" }, challenge: { type: "string", readOnly: true }, expiresIn: { type: "integer" } } },
  RecoveryRequest: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } },
  RecoveryReset: { type: "object", required: ["token", "password"], properties: { token: { type: "string", writeOnly: true }, password: secret("New password", 15) } },
  PasswordChange: { type: "object", required: ["currentPassword", "newPassword"], properties: { currentPassword: secret("Current password"), newPassword: secret("New password", 15) } },
  RecoveryAccepted: { type: "object", properties: { accepted: { type: "boolean" } } },
  ActionResult: { type: "object", properties: { updated: { type: "boolean" }, count: { type: "integer" } } },
  Authenticated: { type: "object", properties: { authenticated: { type: "boolean" } } },
  Session: { type: "object", properties: { id: { type: "string" }, createdAt: { type: "string", format: "date-time" }, lastActivityAt: { type: "string", format: "date-time" }, expiresAt: { type: "string", format: "date-time" }, absoluteExpiresAt: { type: "string", format: "date-time" }, userAgentSummary: { type: ["string", "null"] } } },
  SessionList: { type: "array", items: { $ref: "#/components/schemas/Session" } },
  MfaStatus: { type: "object", properties: { enabled: { type: "boolean" } } },
  MfaSetup: { type: "object", properties: { secret: { type: "string", readOnly: true }, otpauthUrl: { type: "string", readOnly: true } } },
  MfaCode: { type: "object", required: ["code"], properties: { code: { type: "string", pattern: "^\\d{6}$", writeOnly: true } } },
  MfaPasswordCode: { type: "object", required: ["password", "code"], properties: { password: secret("Password"), code: { type: "string", pattern: "^\\d{6}$", writeOnly: true } } },
  MfaChallengeCode: { type: "object", required: ["challenge", "code"], properties: { challenge: { type: "string", writeOnly: true }, code: { type: "string", pattern: "^\\d{6}$", writeOnly: true } } },
  MfaChallengeRecovery: { type: "object", required: ["challenge", "code"], properties: { challenge: { type: "string", writeOnly: true }, code: { type: "string", minLength: 8, writeOnly: true } } },
  RecoveryCodes: { type: "object", properties: { recoveryCodes: { type: "array", items: { type: "string", writeOnly: true } } } },
  InvitationCreate: { type: "object", required: ["targetEmail", "role"], properties: { targetEmail: { type: "string", format: "email" }, role: { type: "string" }, expiresAt: { type: "string", format: "date-time" }, sedeId: { type: ["integer", "null"] }, areaId: { type: ["integer", "null"] }, turnoId: { type: ["integer", "null"] } } },
  InvitationAccept: { type: "object", required: ["codigo", "password"], properties: { codigo: { type: "string" }, password: secret("Password", 15) } },
  Invitation: { type: "object", properties: { id: { type: "string" }, targetEmail: { type: "string", format: "email" }, role: { type: "string" }, status: { type: "string" }, expiresAt: { type: "string", format: "date-time" } } },
  InvitationList: { type: "array", items: { $ref: "#/components/schemas/Invitation" } },
  Notification: { type: "object", properties: { id: { type: "string" }, type: { type: "string" }, payload: { type: "object" }, readAt: { type: ["string", "null"], format: "date-time" }, createdAt: { type: "string", format: "date-time" } } },
  NotificationList: { type: "array", items: { $ref: "#/components/schemas/Notification" } },
} as const;
