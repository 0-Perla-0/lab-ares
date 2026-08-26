import { describe, expect, it } from "vitest";

import { createOpenApiDocument } from "../../../src/openapi/openapi.document";

describe("OpenAPI document", () => {
  const document = createOpenApiDocument();

  it("publishes an OpenAPI 3.1 contract", () => {
    expect(document.openapi).toBe("3.1.0");
    expect(document.components.securitySchemes.cookieAuth).toMatchObject({
      in: "cookie",
      name: "ares-session",
    });
  });

  it.each([
    "/api/health",
    "/api/health/live",
    "/api/health/ready",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/me",
    "/api/attendance/check-in",
    "/api/attendance/check-out",
    "/api/attendance/me/current",
    "/api/attendance/me",
    "/api/organization/sedes",
    "/api/organization/areas",
    "/api/organization/turnos",
    "/api/users",
    "/api/users/{id}",
  ])("documents %s", (path) => {
    expect(document.paths).toHaveProperty(path);
  });

  it("requires idempotency for attendance commands", () => {
    const operation = document.paths["/api/attendance/check-in"].post;
    expect(operation.parameters).toContainEqual(
      expect.objectContaining({ name: "Idempotency-Key", required: true }),
    );
    expect(operation.requestBody.required).toBe(false);
  });
});
