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
    "/api/reports/operational-metrics",
    "/api/reports/export",
    "/api/reports/export/{id}/status",
    "/api/reports/export/{id}/download",
    "/api/library",
    "/api/library/{id}",
    "/api/library/{id}/versions",
    "/api/library/{id}/archive",
    "/api/library/versions/{id}/submit-review",
    "/api/library/versions/{id}/review",
    "/api/library/versions/{id}/publish",
    "/api/library/versions/{id}/download",
    "/api/library/versions/{id}/acknowledge",
    "/api/public-content/pages/{slug}",
    "/api/public-content/faq",
    "/api/public-content/assets/{id}",
    "/api/public-content/admin/pages",
    "/api/public-content/admin/pages/{id}",
    "/api/public-content/admin/pages/{id}/versions",
    "/api/public-content/admin/versions/{id}/publish",
    "/api/public-content/admin/pages/{id}/archive",
    "/api/public-content/admin/assets",
    "/api/public-content/admin/assets/{id}/archive",
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

  it("documents scoped report metrics and the synchronous/asynchronous export contract", () => {
    const metrics = document.paths["/api/reports/operational-metrics"].get;
    expect(metrics.description).toContain(
      "authenticated actor's backend access scope",
    );
    expect(metrics.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "from",
          schema: expect.objectContaining({ format: "date-time" }),
        }),
        expect.objectContaining({
          name: "to",
          schema: expect.objectContaining({ format: "date-time" }),
        }),
      ]),
    );
    const exportOperation = document.paths["/api/reports/export"].post;
    expect(exportOperation.responses[200].content["text/csv"]).toBeDefined();
    expect(
      exportOperation.responses[202].content["application/json"],
    ).toBeDefined();
    expect(exportOperation.description).toContain("5,000");
    expect(document.components.schemas.ReportExportType.enum).toEqual([
      "ATTENDANCE",
      "DOCUMENTS",
      "KAIROS",
    ]);
    expect(
      document.components.schemas.ReportExportJob.properties.id.pattern,
    ).toBe("^[a-z0-9]{20,30}$");
    expect(
      document.components.schemas.OperationalMetricsResponse.properties.data
        .properties.kairos.type,
    ).toBe("object");
    expect(
      document.components.schemas.ReportDownloadResponse.properties.data
        .properties.url.description,
    ).toContain("24-hour");
  });

  it("documents immutable library versions, scoped workflow and non-legal acknowledgements", () => {
    const list = document.paths["/api/library"].get;
    expect(list.description).toContain("active PROYECTO membership");
    expect(list.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "categoria" }),
        expect.objectContaining({ name: "alcance" }),
        expect.objectContaining({ name: "estado" }),
      ]),
    );
    expect(document.paths["/api/library"].post.description).toContain(
      "immutable version 1",
    );
    expect(
      document.paths["/api/library/versions/{id}/review"].post.description,
    ).toContain("cannot review their own");
    expect(
      document.paths["/api/library/versions/{id}/publish"].post.description,
    ).toContain("motivoSustitucion");
    expect(
      document.paths["/api/library/versions/{id}/acknowledge"].post.description,
    ).toContain("not a signature");
    expect(document.components.schemas.LibraryScope.enum).toEqual([
      "GLOBAL",
      "SEDE",
      "AREA",
      "PROYECTO",
    ]);
    expect(document.components.schemas.LibraryState.enum).toEqual([
      "BORRADOR",
      "EN_REVISION",
      "PUBLICADO",
      "ARCHIVADO",
    ]);
    expect(
      document.components.schemas.LibraryCreateInput.properties.archivoId.pattern,
    ).toBe("^[a-f0-9]{30}$");
  });

  it("documents the safe public CMS and isolated public-asset contract", () => {
    expect(
      document.paths["/api/public-content/pages/{slug}"].get.security,
    ).toEqual([]);
    expect(
      document.paths["/api/public-content/admin/pages"].post.security,
    ).toEqual([{ cookieAuth: [] }]);
    expect(
      document.paths["/api/public-content/admin/versions/{id}/publish"].post
        .description,
    ).toContain("Administrator-only");
    expect(
      document.paths["/api/public-content/admin/assets"].post.description,
    ).toContain("isolated public bucket");
    expect(document.components.schemas.PublicPageSlug.enum).toEqual([
      "inicio",
      "servicio-social",
      "preguntas-frecuentes",
      "acerca-de-ares",
      "contacto",
      "informacion-legal",
    ]);
    expect(document.components.schemas.PublicContentBlock.oneOf).toHaveLength(7);
    expect(
      document.components.schemas.PublicContentState.enum,
    ).toEqual(["BORRADOR", "PUBLICADO", "ARCHIVADO"]);
  });

  it("documents private feature-flagged gamification and append-only reversals", () => {
    const profile = document.paths["/api/gamification/me"].get;
    expect(profile.security).toEqual([{ cookieAuth: [] }]);
    expect(profile.description).toContain("No public ranking");
    expect(profile.responses[503]).toBeDefined();
    expect(document.paths["/api/gamification/admin/recognitions"].post.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Idempotency-Key", required: true })]),
    );
    expect(document.paths["/api/gamification/admin/events/{id}/reverse"].post.description).toContain(
      "never edited or deleted",
    );
    expect(document.components.schemas.GamificationRuleOrigin.enum).toEqual(["KAIROS_TERMINADA"]);
    expect(document.components.schemas.GamificationProfileResponse.properties.data.properties.privado.const).toBe(true);
  });
});
