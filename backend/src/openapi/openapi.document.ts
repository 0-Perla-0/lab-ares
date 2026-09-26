import { attendancePaths, attendanceSchemas } from "./attendance.openapi";
import { identityPaths, identitySchemas } from "./identity.openapi";

const cookieSecurity = [{ cookieAuth: [] }];

const userRoles = [
  "PRESTADOR",
  "COORDINADOR",
  "JEFE_COORDINADORES",
  "JEFE_AREA",
  "JEFE_SEDE",
  "ADMIN",
] as const;

const userStates = [
  "ACTIVO",
  "INVITADA",
  "INACTIVO",
  "LIBERADO",
  "BAJA",
] as const;

const errorResponses: Record<string, any> = {
  400: { description: "Invalid request" },
  401: { description: "Authentication required" },
  403: { description: "Insufficient permissions" },
  404: { description: "Resource not found" },
  409: { description: "Conflict" },
  500: { description: "Unexpected server error" },
};
const academicErrorResponses = { ...errorResponses, 404: { description: "Academic resource not found" }, 409: { description: "Academic conflict" } };

const kairosPaths = {
  "/api/kairos/projects": {
    get: { tags: ["Kairos"], security: cookieSecurity, parameters: [
      { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 } },
      { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
      { name: "search", in: "query", schema: { type: "string", maxLength: 191 } },
      { name: "favorite", in: "query", schema: { type: "boolean", default: false } },
    ], responses: { 200: { description: "Projects where the authenticated user is an active member", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosProjectPageResponse" } } } }, ...errorResponses } },
    post: { tags: ["Kairos"], security: cookieSecurity, description: "Creates a project and adds the creator as PROPIETARIO. Requires kairos:project:create (area, sede or global scope).", requestBody: jsonBody({ $ref: "#/components/schemas/KairosProjectInput" }), responses: { 201: { description: "Project created", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosProjectResponse" } } } }, ...errorResponses } },
  },
  "/api/kairos/projects/{id}": {
    get: { tags: ["Kairos"], security: cookieSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", minLength: 1 } }], responses: { 200: { description: "Project and active members visible to the authenticated member", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosProjectDetailResponse" } } } }, ...errorResponses } },
    patch: { tags: ["Kairos"], security: cookieSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }], requestBody: jsonBody({ $ref: "#/components/schemas/KairosProjectUpdateInput" }), responses: { 200: { description: "Project updated by owner or subleader", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosProjectResponse" } } } }, ...errorResponses } },
  },
  "/api/kairos/projects/{id}/archive": { post: { tags: ["Kairos"], security: cookieSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Project archived" }, ...errorResponses } } },
  "/api/kairos/projects/{id}/members": { post: { tags: ["Kairos"], security: cookieSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: jsonBody({ $ref: "#/components/schemas/KairosMemberInput" }), responses: { 201: { description: "Member added" }, 400: { description: "Member user is not active or payload is invalid" }, 403: { description: "Only owner or subleader can manage members" }, 404: { description: "Project not found in actor scope" }, 409: { description: "User is already a member" } } } },
  "/api/kairos/projects/{id}/members/{userId}": {
    patch: { tags: ["Kairos"], security: cookieSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { name: "userId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }], requestBody: jsonBody({ $ref: "#/components/schemas/KairosMemberRoleInput" }), responses: { 200: { description: "Member role changed" }, 403: { description: "Only owner or subleader can manage members" }, 404: { description: "Project or member not found" }, 409: { description: "The project requires at least one owner" } } },
    delete: { tags: ["Kairos"], security: cookieSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { name: "userId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }], responses: { 200: { description: "Member removed (soft removal)" }, 403: { description: "Only owner or subleader can manage members" }, 404: { description: "Project or member not found" }, 409: { description: "The project requires at least one owner" } } },
  },
  "/api/kairos/projects/{id}/members/{userId}/transfer": {
    post: { tags: ["Kairos"], security: cookieSecurity, description: "Transfers ownership atomically. Only the current PROPIETARIO may invoke it; the current owner becomes SUBLIDER and the destination becomes PROPIETARIO.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { name: "userId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }], responses: { 200: { description: "Ownership transferred atomically" }, 403: { description: "Only the current owner may transfer ownership" }, 404: { description: "Project or member not found" }, 409: { description: "Destination is not an active member or transfer conflicts" }, ...errorResponses } },
  },
  "/api/kairos/projects/{id}/favorite": { put: { tags: ["Kairos"], security: cookieSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: jsonBody({ $ref: "#/components/schemas/KairosFavoriteInput" }), responses: { 200: { description: "Favorite state updated", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosFavoriteResponse" } } } }, ...errorResponses } } },
};

const kairosSchemas = {
  KairosProjectInput: { type: "object", required: ["nombre"], additionalProperties: false, properties: { nombre: { type: "string", minLength: 1, maxLength: 191 }, descripcion: { anyOf: [{ type: "string", maxLength: 1000 }, { type: "null" }] }, prioridad: { type: "string", enum: ["BAJA", "MEDIA", "ALTA", "CRITICA"] } } },
  KairosProjectUpdateInput: { type: "object", minProperties: 1, additionalProperties: false, description: "At least one property is required; all properties are optional in this partial update.", properties: { nombre: { type: "string", minLength: 1, maxLength: 191 }, descripcion: { anyOf: [{ type: "string", maxLength: 1000 }, { type: "null" }] }, prioridad: { type: "string", enum: ["BAJA", "MEDIA", "ALTA", "CRITICA"] }, estado: { type: "string", enum: ["BORRADOR", "ACTIVO", "ARCHIVADO"] } } },
  KairosMemberInput: { type: "object", required: ["usuarioId", "rol"], additionalProperties: false, description: "PROPIETARIO is intentionally excluded; ownership is granted only by the transfer endpoint.", properties: { usuarioId: { type: "integer", minimum: 1 }, rol: { type: "string", enum: ["SUBLIDER", "COLABORADOR", "OBSERVADOR"] } } },
  KairosMemberRoleInput: { type: "object", required: ["rol"], additionalProperties: false, description: "PROPIETARIO is intentionally excluded; ownership is granted only by the transfer endpoint.", properties: { rol: { type: "string", enum: ["SUBLIDER", "COLABORADOR", "OBSERVADOR"] } } },
  KairosFavoriteInput: { type: "object", required: ["enabled"], additionalProperties: false, properties: { enabled: { type: "boolean" } } },
  KairosProject: { type: "object", properties: { id: { type: "string" }, nombre: { type: "string" }, descripcion: { anyOf: [{ type: "string" }, { type: "null" }] }, estado: { type: "string", enum: ["BORRADOR", "ACTIVO", "ARCHIVADO"] }, prioridad: { type: "string", enum: ["BAJA", "MEDIA", "ALTA", "CRITICA"] }, creadoPorId: { type: "integer" }, rol: { type: "string", enum: ["PROPIETARIO", "SUBLIDER", "COLABORADOR", "OBSERVADOR"] }, favorito: { type: "boolean" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } },
  KairosMember: { type: "object", properties: { usuarioId: { type: "integer" }, rol: { type: "string", enum: ["PROPIETARIO", "SUBLIDER", "COLABORADOR", "OBSERVADOR"] }, createdAt: { type: "string", format: "date-time" }, usuario: { type: "object", properties: { id: { type: "integer" }, codigo: { type: "string" } } } } },
  KairosProjectPageResponse: { type: "object", properties: { data: { type: "object", required: ["items", "page", "pageSize", "total"], properties: { items: { type: "array", items: { $ref: "#/components/schemas/KairosProject" } }, page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" } } } } },
  KairosProjectResponse: { type: "object", properties: { data: { $ref: "#/components/schemas/KairosProject" } } },
  KairosProjectDetailResponse: { type: "object", properties: { data: { allOf: [{ $ref: "#/components/schemas/KairosProject" }, { type: "object", properties: { miembros: { type: "array", items: { $ref: "#/components/schemas/KairosMember" } } } }] } } },
  KairosFavoriteResponse: { type: "object", properties: { data: { type: "object", required: ["id", "favorito"], properties: { id: { type: "string" }, favorito: { type: "boolean" } } } } },
};

function normalizeKairosPathParameters(paths: Record<string, any>) {
  for (const [path, operations] of Object.entries(paths)) {
    if (!path.startsWith("/api/kairos/")) continue;
    for (const operation of Object.values(operations as Record<string, any>)) {
      for (const parameter of operation.parameters ?? []) {
        if (parameter.name === "userId") parameter.schema = { type: "integer", minimum: 1 };
        if (parameter.name === "id") parameter.schema = { type: "string", minLength: 1, pattern: "^[a-z0-9]+$", description: "Project CUID" };
      }
    }
  }
}

const documentPaths = {
  "/api/documents": {
    get: {
      tags: ["Documents"], security: cookieSecurity,
      parameters: [
        { name: "userId", in: "query", schema: { type: "integer", minimum: 1 }, description: "Optional target user; visibility is limited by the actor scope." },
        { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
        { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
      ],
      responses: { 200: { description: "Active document requirements and latest versions", content: { "application/json": { schema: { $ref: "#/components/schemas/DocumentsPageResponse" } } } }, ...errorResponses },
    },
  },
  "/api/documents/requirements": {
    post: {
      tags: ["Documents"], security: cookieSecurity,
      requestBody: jsonBody({ $ref: "#/components/schemas/DocumentRequirementInput" }),
      responses: { 201: { description: "Requirement created", content: { "application/json": { schema: { $ref: "#/components/schemas/DocumentRequirementResponse" } } } }, ...errorResponses },
    },
  },
  "/api/documents/versions": {
    post: {
      tags: ["Documents"], security: cookieSecurity,
      requestBody: jsonBody({ $ref: "#/components/schemas/DocumentUploadInput" }),
      responses: { 201: { description: "Version uploaded for review", content: { "application/json": { schema: { $ref: "#/components/schemas/DocumentVersionResponse" } } } }, ...errorResponses, 413: { description: "Uploaded file exceeds configured size limit" }, 415: { description: "File type is not supported" } },
    },
  },
  "/api/documents/versions/{id}/review": {
    post: {
      tags: ["Documents"], security: cookieSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: jsonBody({ $ref: "#/components/schemas/DocumentReviewInput" }),
      responses: { 200: { description: "Version reviewed", content: { "application/json": { schema: { $ref: "#/components/schemas/DocumentVersionResponse" } } } }, ...errorResponses },
    },
  },
  "/api/documents/versions/{id}/download": {
    get: {
      tags: ["Documents"], security: cookieSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Short-lived authorized download URL", content: { "application/json": { schema: { $ref: "#/components/schemas/DocumentDownloadResponse" } } } }, ...errorResponses },
    },
  },
};

const documentSchemas = {
  DocumentRequirementInput: { type: "object", required: ["usuarioId", "codigo", "nombre"], additionalProperties: false, properties: { usuarioId: { type: "integer", minimum: 1 }, codigo: { type: "string", minLength: 1, maxLength: 80 }, nombre: { type: "string", minLength: 1, maxLength: 191 }, obligatorio: { type: "boolean", default: true } } },
  DocumentUploadInput: { type: "object", required: ["requisitoId", "archivoId"], additionalProperties: false, properties: { requisitoId: { type: "integer", minimum: 1 }, archivoId: { type: "string", minLength: 1, maxLength: 30, description: "Previously scanned/available Archivo id; upload is linked to this stored object." } } },
  DocumentReviewInput: {
    oneOf: [
      { type: "object", required: ["estado"], additionalProperties: false, properties: { estado: { const: "AUTORIZADO" }, comentario: { type: "string", maxLength: 1000 } } },
      { type: "object", required: ["estado", "comentario"], additionalProperties: false, properties: { estado: { const: "RECHAZADO" }, comentario: { type: "string", minLength: 1, maxLength: 1000 } } },
      { type: "object", required: ["estado", "comentario"], additionalProperties: false, properties: { estado: { const: "REQUIERE_CORRECCION" }, comentario: { type: "string", minLength: 1, maxLength: 1000 } } },
    ],
    description: "comentario is optional for AUTORIZADO and required, non-empty, for RECHAZADO or REQUIERE_CORRECCION.",
  },
  DocumentRequirement: { type: "object", properties: { id: { type: "integer" }, usuarioId: { type: "integer" }, codigo: { type: "string" }, nombre: { type: "string" }, obligatorio: { type: "boolean" }, activo: { type: "boolean" }, versiones: { type: "array", items: { $ref: "#/components/schemas/DocumentVersion" } } } },
  DocumentVersion: { type: "object", properties: { id: { type: "string" }, requisitoId: { type: "integer" }, archivoId: { type: "string" }, version: { type: "integer" }, estado: { type: "string", enum: ["EN_REVISION", "AUTORIZADO", "RECHAZADO", "REQUIERE_CORRECCION"] }, comentario: { type: ["string", "null"] }, cargadoPorId: { type: "integer" }, revisadoPorId: { type: ["integer", "null"] } } },
  DocumentsPage: { type: "object", required: ["items", "total", "page", "pageSize"], properties: { items: { type: "array", items: { $ref: "#/components/schemas/DocumentRequirement" } }, total: { type: "integer" }, page: { type: "integer" }, pageSize: { type: "integer" } } },
  DocumentsPageResponse: { type: "object", properties: { data: { $ref: "#/components/schemas/DocumentsPage" } } },
  DocumentRequirementResponse: { type: "object", properties: { data: { $ref: "#/components/schemas/DocumentRequirement" } } },
  DocumentVersionResponse: { type: "object", properties: { data: { $ref: "#/components/schemas/DocumentVersion" } } },
  DocumentDownloadResponse: { type: "object", properties: { data: { type: "string", format: "uri", description: "Short-lived signed URL" } } },
};

function jsonBody(schema: object) {
  return {
    required: true,
    content: { "application/json": { schema } },
  };
}

function idParameter() {
  return [
    {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "integer", minimum: 1 },
    },
  ];
}

function nullableIdSchema(defaultToNull = false) {
  const schema = {
    anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
  };

  return defaultToNull ? { ...schema, default: null } : schema;
}

function organizationPaths(
  resource: "sedes" | "areas" | "turnos",
  schemaName: "SedeInput" | "AreaInput" | "TurnoInput",
  updateSchemaName: "SedeUpdateInput" | "AreaUpdateInput" | "TurnoUpdateInput",
) {
  const base = `/api/organization/${resource}`;

  return {
    [base]: {
      get: {
        tags: ["Organization"],
        security: cookieSecurity,
        responses: {
          200: { description: `Active ${resource}` },
          ...errorResponses,
        },
      },
      post: {
        tags: ["Organization"],
        security: cookieSecurity,
        requestBody: jsonBody({ $ref: `#/components/schemas/${schemaName}` }),
        responses: { 201: { description: "Created" }, ...errorResponses },
      },
    },
    [`${base}/{id}`]: {
      get: {
        tags: ["Organization"],
        security: cookieSecurity,
        parameters: idParameter(),
        responses: {
          200: { description: "Resource found" },
          404: { description: "Resource not found" },
          ...errorResponses,
        },
      },
      put: {
        tags: ["Organization"],
        security: cookieSecurity,
        parameters: idParameter(),
        requestBody: jsonBody({
          $ref: `#/components/schemas/${updateSchemaName}`,
        }),
        responses: {
          200: { description: "Updated" },
          404: { description: "Resource not found" },
          ...errorResponses,
        },
      },
      delete: {
        tags: ["Organization"],
        security: cookieSecurity,
        parameters: idParameter(),
        responses: {
          200: { description: "Logically deactivated" },
          404: { description: "Resource not found" },
          ...errorResponses,
        },
      },
    },
  };
}

function userPaths() {
  return {
    "/api/users": {
      get: {
        tags: ["Users"],
        security: cookieSecurity,
        responses: {
          200: { description: "Users visible in the authenticated scope" },
          ...errorResponses,
        },
      },
      post: {
        tags: ["Users"],
        security: cookieSecurity,
        requestBody: jsonBody({ $ref: "#/components/schemas/UserInput" }),
        responses: {
          201: { description: "User created" },
          409: { description: "Code or email already exists" },
          ...errorResponses,
        },
      },
    },
    "/api/users/{id}": {
      get: {
        tags: ["Users"],
        security: cookieSecurity,
        parameters: idParameter(),
        responses: {
          200: { description: "User found" },
          404: { description: "User not found" },
          ...errorResponses,
        },
      },
      put: {
        tags: ["Users"],
        security: cookieSecurity,
        parameters: idParameter(),
        requestBody: jsonBody({
          $ref: "#/components/schemas/UserUpdateInput",
        }),
        responses: {
          200: { description: "User updated" },
          404: { description: "User not found" },
          409: { description: "Code or email already exists" },
          ...errorResponses,
        },
      },
      delete: {
        tags: ["Users"],
        security: cookieSecurity,
        parameters: idParameter(),
        responses: {
          200: { description: "User logically deleted with BAJA state" },
          404: { description: "User not found" },
          409: { description: "Self-deletion is not allowed" },
          ...errorResponses,
        },
      },
    },
  };
}

export function createOpenApiDocument() {
  normalizeKairosPathParameters(kairosPaths);
  return {
    openapi: "3.1.0",
    info: {
      title: "Ares Backend API",
      version: "0.3.0",
      description: "NestJS API for authentication and Ares domain services.",
    },
    servers: [{ url: "/" }],
    tags: [
      { name: "Health" },
      { name: "Authentication" },
      { name: "Attendance" },
      { name: "Organization" },
      { name: "Users" },
      { name: "Academic" },
      { name: "Documents" },
      { name: "Kairos", description: "Project collaboration, membership and favorites" },
    ],
    paths: {
      "/api/health": {
        get: {
          tags: ["Health"],
          security: [],
          responses: {
            200: { description: "Service and database are available" },
            503: { description: "Database is unavailable" },
          },
        },
      },
      "/api/health/live": {
        get: {
          tags: ["Health"],
          security: [],
          responses: { 200: { description: "Backend process is alive" } },
        },
      },
      "/api/health/ready": {
        get: {
          tags: ["Health"],
          security: [],
          responses: {
            200: { description: "Backend is ready to receive traffic" },
            503: { description: "Database is unavailable" },
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Authentication"],
          security: [],
          requestBody: jsonBody({ $ref: "#/components/schemas/LoginInput" }),
          responses: {
            ...errorResponses,
            200: { description: "Authenticated session created" },
            401: { description: "Invalid credentials" },
            429: { description: "Too many login attempts" },
          },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["Authentication"],
          security: [],
          responses: { 204: { description: "Session destroyed" } },
        },
      },
      "/api/auth/me": {
        get: {
          tags: ["Authentication"],
          security: cookieSecurity,
          responses: {
            200: { description: "Current authenticated user" },
            401: { description: "Authentication required" },
          },
        },
      },
      ...organizationPaths("sedes", "SedeInput", "SedeUpdateInput"),
      ...organizationPaths("areas", "AreaInput", "AreaUpdateInput"),
      ...organizationPaths("turnos", "TurnoInput", "TurnoUpdateInput"),
      ...userPaths(),
      ...identityPaths,
      ...attendancePaths,
      ...documentPaths,
      ...kairosPaths,
      "/api/academic/catalogs": {
        get: { tags: ["Academic"], security: cookieSecurity, parameters: [{ name: "page", in: "query", schema: { type: "integer", minimum: 1 } }, { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }, { name: "search", in: "query", schema: { type: "string" } }], responses: { 200: { description: "Active academic catalogues with pagination", content: { "application/json": { schema: { $ref: "#/components/schemas/AcademicCatalogsResponse" } } } }, ...academicErrorResponses } },
      },
      "/api/academic/profile/me": {
        get: { tags: ["Academic"], security: cookieSecurity, responses: { 200: { description: "Current academic profile", content: { "application/json": { schema: { $ref: "#/components/schemas/AcademicProfileResponse" } } } }, ...errorResponses } },
        put: { tags: ["Academic"], security: cookieSecurity, requestBody: jsonBody({ $ref: "#/components/schemas/AcademicProfileInput" }), responses: { 200: { description: "Historical academic affiliation created", content: { "application/json": { schema: { $ref: "#/components/schemas/AcademicProfileResponse" } } } }, ...errorResponses } },
      },
      "/api/academic/profile/{id}": {
        get: { tags: ["Academic"], security: cookieSecurity, parameters: idParameter(), responses: { 200: { description: "Academic profile", content: { "application/json": { schema: { $ref: "#/components/schemas/AcademicProfileResponse" } } } }, ...errorResponses } },
      },
      "/api/academic/profile/{id}/history": {
        get: { tags: ["Academic"], security: cookieSecurity, parameters: idParameter(), responses: { 200: { description: "Academic affiliation history with pagination", content: { "application/json": { schema: { $ref: "#/components/schemas/AcademicHistoryResponse" } } } }, ...errorResponses } },
      },
      "/api/academic/requests/pending": {
        get: { tags: ["Academic"], security: cookieSecurity, responses: { 200: { description: "Pending requests accessible by reviewer scope", content: { "application/json": { schema: { $ref: "#/components/schemas/AcademicPendingResponse" } } } }, ...errorResponses } },
      },
      "/api/academic/catalogs/{kind}": {
        post: { tags: ["Academic"], security: cookieSecurity, parameters: [{ name: "kind", in: "path", required: true, schema: { type: "string", enum: ["institucion", "unidad", "programa", "cohorte"] } }], requestBody: jsonBody({ $ref: "#/components/schemas/AcademicCatalogInput" }), responses: { 201: { description: "Catalog entry created", content: { "application/json": { schema: { $ref: "#/components/schemas/AcademicCatalogCreatedResponse" } } } }, ...errorResponses } },
      },
      "/api/academic/profile/requests/{id}/confirm": {
        post: { tags: ["Academic"], security: cookieSecurity, parameters: idParameter(), requestBody: jsonBody({ $ref: "#/components/schemas/AcademicConfirmationInput" }), responses: { 200: { description: "Request confirmed or rejected", content: { "application/json": { schema: { $ref: "#/components/schemas/AcademicConfirmationResponse" } } } }, 409: { description: "Already resolved" }, ...errorResponses } },
      },
    },
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "ares-session",
        },
      },
      schemas: {
        ...attendanceSchemas,
        ...documentSchemas,
        ...kairosSchemas,
        AcademicProfileInput: {
          type: "object", required: ["institucionId", "programaAcademicoId", "inicio"], additionalProperties: false,
          properties: { institucionId: { type: "integer", minimum: 1 }, unidadAcademicaId: nullableIdSchema(true), programaAcademicoId: { type: "integer", minimum: 1 }, cohorteId: nullableIdSchema(true), inicio: { type: "string", format: "date" }, fin: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] } },
        },
        AcademicCatalogInput: { type: "object", required: ["nombre"], properties: { nombre: { type: "string", minLength: 1, maxLength: 191 }, parentId: { type: ["integer", "null"], minimum: 1 } } },
        AcademicConfirmationInput: { oneOf: [{ type: "object", required: ["accept"], properties: { accept: { const: true }, motivo: { type: "string", maxLength: 500 } }, additionalProperties: false }, { type: "object", required: ["accept", "motivo"], properties: { accept: { const: false }, motivo: { type: "string", minLength: 1, maxLength: 500 } }, additionalProperties: false }], description: "When accept is false, motivo is required and non-empty." },
        AcademicCatalogItem: { type: "object", properties: { id: { type: "integer" }, nombre: { type: "string" }, activa: { type: "boolean" } } },
        AcademicPage: { type: "object", required: ["items", "page", "pageSize", "total"], properties: { items: { type: "array", items: { $ref: "#/components/schemas/AcademicCatalogItem" } }, page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" } } },
        AcademicCatalogsResponse: { type: "object", properties: { data: { type: "object", properties: { page: { type: "integer" }, pageSize: { type: "integer" }, instituciones: { $ref: "#/components/schemas/AcademicPage" }, unidades: { $ref: "#/components/schemas/AcademicPage" }, programas: { $ref: "#/components/schemas/AcademicPage" }, cohortes: { $ref: "#/components/schemas/AcademicPage" } } } } },
        AcademicProfileResponse: { type: "object", properties: { data: { anyOf: [{ $ref: "#/components/schemas/AcademicAffiliation" }, { type: "null" }] } } },
        AcademicAffiliation: { type: "object", properties: { id: { type: "integer" }, usuarioId: { type: "integer" }, estado: { type: "string" }, vigente: { type: "boolean" }, inicio: { type: "string", format: "date-time" }, fin: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] } } },
        AcademicPendingResponse: { type: "object", properties: { data: { $ref: "#/components/schemas/AcademicHistoryPage" } } },
        AcademicHistoryResponse: { type: "object", properties: { data: { $ref: "#/components/schemas/AcademicHistoryPage" } } },
        AcademicHistoryPage: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/AcademicAffiliation" } }, page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" } } },
        AcademicConfirmationResponse: { type: "object", properties: { data: { $ref: "#/components/schemas/AcademicAffiliation" } } },
        AcademicCatalogCreatedResponse: { type: "object", properties: { data: { $ref: "#/components/schemas/AcademicCatalogItem" } } },
        LoginInput: {
          type: "object",
          required: ["email", "password"],
          additionalProperties: false,
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 1, maxLength: 128, writeOnly: true },
          },
        },
        UserInput: {
          type: "object",
          required: ["codigo", "email", "password"],
          additionalProperties: false,
          properties: {
            codigo: { type: "string", minLength: 1, maxLength: 50 },
            email: { type: "string", format: "email", maxLength: 191 },
            password: {
              type: "string",
              minLength: 12,
              maxLength: 128,
              writeOnly: true,
              description: "Must also fit bcrypt's 72-byte UTF-8 limit",
            },
            rol: { enum: userRoles, default: "PRESTADOR" },
            estado: {
              enum: userStates.filter((state) => state !== "BAJA"),
              default: "INVITADA",
            },
            sedeId: nullableIdSchema(true),
            areaId: nullableIdSchema(true),
            turnoId: nullableIdSchema(true),
          },
        },
        UserUpdateInput: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: {
            codigo: { type: "string", minLength: 1, maxLength: 50 },
            email: { type: "string", format: "email", maxLength: 191 },
            password: {
              type: "string",
              minLength: 12,
              maxLength: 128,
              writeOnly: true,
              description: "Must also fit bcrypt's 72-byte UTF-8 limit",
            },
            rol: { enum: userRoles },
            estado: { enum: userStates },
            sedeId: nullableIdSchema(),
            areaId: nullableIdSchema(),
            turnoId: nullableIdSchema(),
          },
        },
        SedeInput: {
          type: "object",
          required: ["nombre"],
          additionalProperties: false,
          properties: {
            nombre: { type: "string", minLength: 1, maxLength: 150 },
            direccion: {
              anyOf: [{ type: "string", maxLength: 255 }, { type: "null" }],
            },
          },
        },
        SedeUpdateInput: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: {
            nombre: { type: "string", minLength: 1, maxLength: 150 },
            direccion: {
              anyOf: [{ type: "string", maxLength: 255 }, { type: "null" }],
            },
          },
        },
        AreaInput: {
          type: "object",
          required: ["nombre", "sedeId"],
          additionalProperties: false,
          properties: {
            nombre: { type: "string", minLength: 1, maxLength: 150 },
            sedeId: { type: "integer", minimum: 1 },
          },
        },
        AreaUpdateInput: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: {
            nombre: { type: "string", minLength: 1, maxLength: 150 },
            sedeId: { type: "integer", minimum: 1 },
          },
        },
        TurnoInput: {
          type: "object",
          required: ["nombre", "areaId", "horaInicio", "horaFin", "dias"],
          additionalProperties: false,
          properties: {
            nombre: { type: "string", minLength: 1, maxLength: 100 },
            areaId: { type: "integer", minimum: 1 },
            horaInicio: {
              type: "string",
              pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
            },
            horaFin: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
            dias: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: {
                enum: [
                  "LUNES",
                  "MARTES",
                  "MIERCOLES",
                  "JUEVES",
                  "VIERNES",
                  "SABADO",
                  "DOMINGO",
                ],
              },
            },
          },
        },
        TurnoUpdateInput: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: {
            nombre: { type: "string", minLength: 1, maxLength: 100 },
            areaId: { type: "integer", minimum: 1 },
            horaInicio: {
              type: "string",
              pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
            },
            horaFin: {
              type: "string",
              pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
            },
            dias: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: {
                enum: [
                  "LUNES",
                  "MARTES",
                  "MIERCOLES",
                  "JUEVES",
                  "VIERNES",
                  "SABADO",
                  "DOMINGO",
                ],
              },
            },
          },
        },
        ...identitySchemas,
      },
    },
  } as const;
}
