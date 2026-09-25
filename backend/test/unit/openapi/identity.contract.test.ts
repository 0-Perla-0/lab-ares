import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createOpenApiDocument } from "../../../src/openapi/openapi.document";

describe("Backend 2 identity API contract", () => {
  const document = createOpenApiDocument() as any;
  const expected: Record<string, string[]> = {
    "/api/auth/mfa": ["get"], "/api/auth/mfa/setup": ["post"], "/api/auth/mfa/enable": ["post"],
    "/api/auth/mfa/disable": ["post"], "/api/auth/mfa/recovery-codes/regenerate": ["post"],
    "/api/auth/mfa/verify": ["post"], "/api/auth/mfa/recovery": ["post"],
    "/api/auth/recovery/request": ["post"], "/api/auth/recovery/reset": ["post"],
    "/api/auth/password/change": ["post"], "/api/auth/sessions": ["get"],
    "/api/auth/sessions/others": ["delete"], "/api/auth/sessions/{id}": ["delete"],
    "/api/invitations": ["get", "post"], "/api/invitations/{token}": ["get"],
    "/api/invitations/{token}/accept": ["post"], "/api/invitations/{id}/revoke": ["post"],
    "/api/notifications": ["get"], "/api/notifications/{id}/read": ["patch"], "/api/notifications/read-all": ["post"],
  };

  it.each(Object.entries(expected))("publishes %s", (path, methods) => {
    expect(document.paths[path]).toBeDefined();
    for (const method of methods) expect(document.paths[path][method]).toBeDefined();
  });

  it("marks every credential/token secret as writeOnly", () => {
    const fields = [
      ["LoginInput", "password"], ["UserInput", "password"], ["UserUpdateInput", "password"],
      ["RecoveryReset", "token"], ["RecoveryReset", "password"], ["PasswordChange", "currentPassword"], ["PasswordChange", "newPassword"],
      ["MfaCode", "code"], ["MfaPasswordCode", "password"], ["MfaPasswordCode", "code"],
      ["MfaChallengeCode", "challenge"], ["MfaChallengeCode", "code"], ["MfaChallengeRecovery", "challenge"], ["MfaChallengeRecovery", "code"], ["InvitationAccept", "password"],
    ];
    for (const [schema, field] of fields) expect(document.components.schemas[schema].properties[field]?.writeOnly, `${schema}.${field}`).toBe(true);
    expect(document.components.schemas.MfaChallenge.properties.challenge.readOnly).toBe(true);
    expect(document.components.schemas.MfaSetup.properties.secret.readOnly).toBe(true);
    expect(document.components.schemas.MfaSetup.properties.otpauthUrl.readOnly).toBe(true);
  });

  it("has valid JSON Postman artifacts", () => {
    for (const file of ["docs/api/postman/ares-backend2.postman_collection.json", "docs/api/postman/ares-local.postman_environment.json"]) {
      const value = JSON.parse(readFileSync(resolve(process.cwd(), "..", file), "utf8"));
      expect(value).toBeTypeOf("object");
    }
  });

  it("provides an assertion hook for every Postman request and no hardcoded identities", () => {
    const collectionPath = resolve(process.cwd(), "..", "docs/api/postman/ares-backend2.postman_collection.json");
    const raw = readFileSync(collectionPath, "utf8");
    const collection = JSON.parse(raw);
    const requests: any[] = [];
    const walk = (items: any[]) => items.forEach((item) => { if (item.request) requests.push(item); if (item.item) walk(item.item); });
    walk(collection.item);
    expect(requests).toHaveLength(35);
    const expectedStatus: Record<string, number> = { Login: 200, "Current user": 200, Logout: 204, "Request recovery": 200, "Reset recovery (token from Mailpit)": 200, "Change password": 200, "List sessions": 200, "Revoke session": 204, "Revoke other sessions": 204, "MFA status": 200, "MFA setup": 200, "MFA enable": 200, "MFA verify challenge": 200, "MFA recovery challenge": 200, "MFA disable": 200, "Regenerate recovery codes": 200, "Create invitation": 201, "List invitations": 200, "Get invitation": 200, "Accept invitation": 201, "Revoke invitation": 200, "List notifications": 200, "Mark notification read": 200, "Mark all notifications read": 200, "Catálogos académicos": 200, "Consultar mi perfil académico": 200, "Solicitar cambio de adscripción": 200, "Crear institución": 201, "Confirmar solicitud": 200, "Solicitudes pendientes": 200, "Historial académico propio": 200, "Rechazar solicitud capturada": 200, "Crear unidad": 201, "Crear programa": 201, "Crear cohorte": 201 };
    for (const request of requests) {
      expect(request.request.url).toBeDefined();
      const script = request.event?.find((event: any) => event.listen === "test")?.script?.exec?.join("\n") ?? "";
      expect(script, `${request.name} test`).toContain(`to.have.status(${expectedStatus[request.name]})`);
    }
    expect(raw).not.toMatch(/(?:admin|new-user)@example\.test|USER-001|000000/);
    expect(raw).not.toMatch(/(?:set|variables\.set)\(['\"](?:invitationToken|recoveryToken|secret|recoveryCodes)['\"]/);
  });
});
