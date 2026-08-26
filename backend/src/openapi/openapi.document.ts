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
  "PENDIENTE",
  "INACTIVO",
  "LIBERADO",
  "BAJA",
] as const;

const errorResponses = {
  400: { description: "Invalid request" },
  401: { description: "Authentication required" },
  403: { description: "Insufficient permissions" },
  500: { description: "Unexpected server error" },
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

function idempotencyHeader() {
  return {
    name: "Idempotency-Key",
    in: "header",
    required: true,
    description:
      "Stable key for safely replaying this command after a lost response",
    schema: {
      type: "string",
      minLength: 16,
      maxLength: 128,
      pattern: "^[A-Za-z0-9._:-]+$",
    },
  } as const;
}

function attendancePaths() {
  const command = (summary: string) => ({
    post: {
      tags: ["Attendance"],
      summary,
      security: cookieSecurity,
      parameters: [idempotencyHeader()],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/AttendanceCommandInput" },
          },
        },
      },
      responses: {
        200: {
          description: "Command confirmed or safely replayed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AttendanceResponse" },
            },
          },
        },
        409: {
          description:
            "Attendance state conflict or idempotency key reused with different input",
        },
        ...errorResponses,
      },
    },
  });

  return {
    "/api/attendance/check-in": command("Start an attendance session"),
    "/api/attendance/check-out": command("Close the open attendance session"),
    "/api/attendance/me/current": {
      get: {
        tags: ["Attendance"],
        summary: "Read the authenticated user's open attendance session",
        security: cookieSecurity,
        responses: {
          200: {
            description: "Current session or null",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: {
                      anyOf: [
                        { $ref: "#/components/schemas/Attendance" },
                        { type: "null" },
                      ],
                    },
                  },
                },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    "/api/attendance/me": {
      get: {
        tags: ["Attendance"],
        summary:
          "Read up to 50 recent sessions owned by the authenticated user",
        security: cookieSecurity,
        responses: {
          200: {
            description: "Attendance history ordered from newest to oldest",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Attendance" },
                    },
                  },
                },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
  };
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
      ...attendancePaths(),
      ...organizationPaths("sedes", "SedeInput", "SedeUpdateInput"),
      ...organizationPaths("areas", "AreaInput", "AreaUpdateInput"),
      ...organizationPaths("turnos", "TurnoInput", "TurnoUpdateInput"),
      ...userPaths(),
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
        LoginInput: {
          type: "object",
          required: ["email", "password"],
          additionalProperties: false,
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
        AttendanceCommandInput: {
          type: "object",
          additionalProperties: false,
          properties: {
            ubicacion: {
              type: "object",
              required: ["latitud", "longitud", "precisionMetros"],
              additionalProperties: false,
              properties: {
                latitud: { type: "number", minimum: -90, maximum: 90 },
                longitud: { type: "number", minimum: -180, maximum: 180 },
                precisionMetros: {
                  type: "number",
                  minimum: 0,
                  maximum: 100000,
                },
              },
            },
          },
        },
        AttendanceEvidenceSummary: {
          type: "object",
          required: ["ubicacionRegistrada", "ipRegistrada"],
          additionalProperties: false,
          properties: {
            ubicacionRegistrada: { type: "boolean" },
            ipRegistrada: { type: "boolean" },
          },
        },
        Attendance: {
          type: "object",
          required: [
            "id",
            "usuarioId",
            "sedeId",
            "areaId",
            "turnoId",
            "estado",
            "entradaAt",
            "salidaAt",
            "duracionMinutos",
            "nivelRiesgo",
            "motivosRiesgo",
            "versionReglaRiesgo",
            "estadoValidacion",
            "evidenciaEntrada",
            "evidenciaSalida",
            "createdAt",
            "updatedAt",
          ],
          additionalProperties: false,
          properties: {
            id: { type: "string", format: "uuid" },
            usuarioId: { type: "integer", minimum: 1 },
            sedeId: nullableIdSchema(),
            areaId: nullableIdSchema(),
            turnoId: nullableIdSchema(),
            estado: { enum: ["ABIERTA", "CERRADA", "CHECKOUT_OMITIDO"] },
            entradaAt: { type: "string", format: "date-time" },
            salidaAt: {
              anyOf: [
                { type: "string", format: "date-time" },
                { type: "null" },
              ],
            },
            duracionMinutos: {
              anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
            },
            nivelRiesgo: {
              enum: ["NO_EVALUADO", "VERDE", "AMARILLO", "ROJO"],
            },
            motivosRiesgo: {
              type: "array",
              uniqueItems: true,
              items: { type: "string" },
            },
            versionReglaRiesgo: { type: "string" },
            estadoValidacion: {
              enum: [
                "PENDIENTE",
                "REQUIERE_REVISION",
                "AUTORIZADA",
                "RECHAZADA",
              ],
            },
            evidenciaEntrada: {
              $ref: "#/components/schemas/AttendanceEvidenceSummary",
            },
            evidenciaSalida: {
              $ref: "#/components/schemas/AttendanceEvidenceSummary",
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        AttendanceResponse: {
          type: "object",
          required: ["data"],
          properties: {
            data: { $ref: "#/components/schemas/Attendance" },
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
              description: "Must also fit bcrypt's 72-byte UTF-8 limit",
            },
            rol: { enum: userRoles, default: "PRESTADOR" },
            estado: {
              enum: userStates.filter((state) => state !== "BAJA"),
              default: "PENDIENTE",
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
      },
    },
  } as const;
}
