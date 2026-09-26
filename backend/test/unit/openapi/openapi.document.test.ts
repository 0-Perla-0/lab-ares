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
    "/api/organization/sedes",
    "/api/organization/areas",
    "/api/organization/turnos",
    "/api/users",
    "/api/users/{id}",
    "/api/kairos/projects/{projectId}/kanban",
    "/api/attendance/me",
    "/api/attendance/open",
    "/api/attendance/check-in",
    "/api/attendance/check-out",
    "/api/attendance/{id}/close",
    "/api/directory",
    "/api/directory/preferences/me",
  ])("documents %s", (path) => {
    expect(document.paths).toHaveProperty(path);
  });

  it("requires idempotency for attendance commands", () => {
    const operation = document.paths["/api/attendance/check-in"].post;
    expect(operation.parameters).toContainEqual(
      expect.objectContaining({ name: "Idempotency-Key", required: true }),
    );
    expect(operation.requestBody.required).toBe(true);
  });

  it("documents the strict seven-lane Kanban projection contract", () => {
    const operation = document.paths["/api/kairos/projects/{projectId}/kanban"].get;
    expect(operation.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "projectId", schema: expect.objectContaining({ pattern: "^c[a-z0-9]{20,30}$" }) }),
      expect.objectContaining({ name: "limitPerLane", schema: expect.objectContaining({ minimum: 1, maximum: 100 }) }),
    ]));
    expect(document.components.schemas.KairosKanban.properties.lanes).toMatchObject({ minItems: 7, maxItems: 7 });
    expect(document.components.schemas.KairosKanbanLane.properties.state.enum).toHaveLength(7);
    expect(document.components.schemas.KairosKanbanCard.properties.vencida.description).toContain("Derived");
  });

  it("documents privacy-scoped directory and preferences contracts", () => {
    const list = document.paths["/api/directory"].get;
    expect(list.security).toEqual([{ cookieAuth: [] }]);
    expect(list.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "scope", required: true, schema: expect.objectContaining({ enum: ["area", "project", "all"] }) }),
      expect.objectContaining({ name: "projectId", schema: expect.objectContaining({ pattern: "^c[a-z0-9]{20,30}$" }) }),
    ]));
    expect(document.paths["/api/directory/preferences/me"].patch.requestBody.required).toBe(true);
    expect(document.components.schemas.DirectoryItem.properties.email.description).toContain("Omitted");
  });
});
