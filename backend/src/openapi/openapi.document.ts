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

const errorResponses = {
  400: { description: "Invalid request" },
  401: { description: "Authentication required" },
  403: { description: "Insufficient permissions" },
  404: { description: "Resource not found" },
  409: { description: "Conflict" },
  500: { description: "Unexpected server error" },
};
const academicErrorResponses = { ...errorResponses, 404: { description: "Academic resource not found" }, 409: { description: "Academic conflict" } };

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
