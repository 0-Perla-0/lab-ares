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

const storagePaths = {
  "/api/files": {
    post: {
      tags: ["Files"], security: cookieSecurity,
      description: "Receives one private file as multipart/form-data. The object is stored in quarantine and scanned asynchronously; consumers must use the returned id and GET /api/files/{id} to observe the scan status before linking it as evidence.",
      requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["file"], additionalProperties: false, properties: { file: { type: "string", format: "binary" } } } } } },
      responses: {
        201: { description: "File accepted for asynchronous malware analysis", content: { "application/json": { schema: { $ref: "#/components/schemas/FileResponse" } } } },
        400: { description: "Missing file, invalid name, size, extension, or content signature" },
        413: { description: "File exceeds STORAGE_MAX_BYTES" },
        415: { description: "Unsupported or mismatched file type" },
        ...errorResponses,
      },
    },
  },
  "/api/files/{id}": {
    get: {
      tags: ["Files"], security: cookieSecurity,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", minLength: 30, maxLength: 30, pattern: "^[a-f0-9]{30}$" }, description: "30-character lowercase hexadecimal id of the private file returned by POST /api/files" }],
      responses: { 200: { description: "Private file metadata and asynchronous scan status", content: { "application/json": { schema: { $ref: "#/components/schemas/FileResponse" } } } }, ...errorResponses },
    },
  },
};

const directoryPaths = {
  "/api/directory": {
    get: { tags: ["Directory"], security: cookieSecurity,
      description: "Lists active users visible in the requested context. scope=all is restricted to global roles and includes all active users; area requires the actor's assigned area and sede; project requires active membership. The response is a safe DirectoryItem; email is returned only for the actor or when the target's mostrarEmail preference allows it.",
      parameters: [
        { name: "scope", in: "query", required: true, schema: { type: "string", enum: ["area", "project", "all"] } },
        { name: "projectId", in: "query", schema: { type: "string", minLength: 21, maxLength: 31, pattern: "^c[a-z0-9]{20,30}$" }, description: "Required only with scope=project; Prisma CUID." },
        { name: "q", in: "query", schema: { type: "string", maxLength: 80 }, description: "Searches code and privacy-permitted email." },
        { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 } },
        { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: { 200: { description: "Paginated privacy-filtered directory", content: { "application/json": { schema: { $ref: "#/components/schemas/DirectoryPageResponse" } } } }, ...errorResponses },
    },
  },
  "/api/directory/preferences/me": {
    get: { tags: ["Directory"], security: cookieSecurity, responses: { 200: { description: "Current directory visibility preferences", content: { "application/json": { schema: { $ref: "#/components/schemas/DirectoryPreferencesResponse" } } } }, ...errorResponses } },
    patch: { tags: ["Directory"], security: cookieSecurity, requestBody: jsonBody({ $ref: "#/components/schemas/DirectoryPreferencesInput" }), responses: { 200: { description: "Directory visibility preferences updated", content: { "application/json": { schema: { $ref: "#/components/schemas/DirectoryPreferencesResponse" } } } }, ...errorResponses } },
  },
};

const directorySchemas = {
  DirectoryItem: { type: "object", additionalProperties: false, required: ["id", "codigo", "rol", "sede", "area", "turno"], properties: { id: { type: "integer", minimum: 1 }, codigo: { type: "string" }, email: { type: "string", format: "email", description: "Omitted unless actor or target preference permits it." }, rol: { type: "string" }, sede: { type: ["object", "null"] }, area: { type: ["object", "null"] }, turno: { type: ["object", "null"] } } },
  DirectoryPage: { type: "object", additionalProperties: false, required: ["items", "page", "pageSize", "total"], properties: { items: { type: "array", items: { $ref: "#/components/schemas/DirectoryItem" } }, page: { type: "integer", minimum: 1 }, pageSize: { type: "integer", minimum: 1, maximum: 100 }, total: { type: "integer", minimum: 0 } } },
  DirectoryPageResponse: { type: "object", required: ["data"], properties: { data: { $ref: "#/components/schemas/DirectoryPage" } } },
  DirectoryPreferencesInput: { type: "object", minProperties: 1, additionalProperties: false, properties: { visibleEnArea: { type: "boolean" }, visibleEnProyectos: { type: "boolean" }, mostrarEmail: { type: "boolean" } } },
  DirectoryPreferences: { type: "object", required: ["visibleEnArea", "visibleEnProyectos", "mostrarEmail"], properties: { visibleEnArea: { type: "boolean" }, visibleEnProyectos: { type: "boolean" }, mostrarEmail: { type: "boolean" } } },
  DirectoryPreferencesResponse: { type: "object", required: ["data"], properties: { data: { $ref: "#/components/schemas/DirectoryPreferences" } } },
};

const reportsPaths = {
  "/api/reports/operational-metrics": {
    get: {
      tags: ["Reports"],
      security: cookieSecurity,
      description:
        "Returns attendance, document and Kairos aggregates constrained by the authenticated actor's backend access scope. The interval is [from, to): from is inclusive and to is exclusive. Both values are ISO-8601 datetimes with offset; defaults to the previous 30 days and cannot exceed one year.",
      parameters: [
        {
          name: "from",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "Inclusive ISO-8601 datetime with offset.",
        },
        {
          name: "to",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "Exclusive ISO-8601 datetime with offset.",
        },
      ],
      responses: {
        200: {
          description: "Scope-filtered operational aggregates",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/OperationalMetricsResponse",
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/reports/export": {
    post: {
      tags: ["Reports"],
      security: cookieSecurity,
      description:
        "Exports a scope-filtered report. Requests with at most 5,000 rows complete synchronously as UTF-8 CSV. Larger requests return a private asynchronous job; its generated download is retained for 24 hours and every request/download is audited.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ReportExportInput" },
          },
        },
      },
      responses: {
        200: {
          description: "Synchronous UTF-8 CSV export (at most 5,000 rows)",
          headers: { "Content-Disposition": { schema: { type: "string" } } },
          content: {
            "text/csv": { schema: { type: "string", format: "binary" } },
          },
        },
        202: {
          description:
            "Asynchronous export job accepted (more than 5,000 rows)",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReportExportJobResponse" },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/reports/export/{id}/status": {
    get: {
      tags: ["Reports"],
      security: cookieSecurity,
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: {
            type: "string",
            pattern: "^[a-z0-9]{20,30}$",
            minLength: 20,
            maxLength: 30,
          },
        },
      ],
      responses: {
        200: {
          description:
            "Private export job status. Retryable failures return to PENDIENTE; terminal failures expose only a safe error code.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReportExportJobResponse" },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/reports/export/{id}/download": {
    get: {
      tags: ["Reports"],
      security: cookieSecurity,
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: {
            type: "string",
            pattern: "^[a-z0-9]{20,30}$",
            minLength: 20,
            maxLength: 30,
          },
        },
      ],
      responses: {
        200: {
          description:
            "Private temporary download URL for a completed and unexpired export",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReportDownloadResponse" },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
};

const reportsSchemas = {
  ReportExportType: {
    type: "string",
    enum: ["ATTENDANCE", "DOCUMENTS", "KAIROS"],
  },
  ReportExportInput: {
    type: "object",
    required: ["type"],
    additionalProperties: false,
    properties: {
      type: { $ref: "#/components/schemas/ReportExportType" },
      from: { type: "string", format: "date-time" },
      to: { type: "string", format: "date-time" },
    },
  },
  OperationalMetricsResponse: {
    type: "object",
    required: ["data"],
    properties: {
      data: {
        type: "object",
        required: [
          "from",
          "to",
          "attendance",
          "documents",
          "kairos",
          "semantics",
        ],
        properties: {
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
          attendance: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          documents: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          kairos: {
            type: "object",
            required: ["byState", "overdue"],
            properties: {
              byState: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
              overdue: { type: "integer", minimum: 0 },
            },
          },
          semantics: { type: "string" },
        },
      },
    },
  },
  ReportExportJob: {
    type: "object",
    required: ["id", "status", "totalFilas"],
    additionalProperties: false,
    properties: {
      id: {
        type: "string",
        pattern: "^[a-z0-9]{20,30}$",
        minLength: 20,
        maxLength: 30,
      },
      type: { $ref: "#/components/schemas/ReportExportType" },
      status: {
        type: "string",
        enum: ["PENDIENTE", "GENERANDO", "COMPLETADO", "FALLIDO", "EXPIRADO"],
      },
      totalFilas: { type: "integer", minimum: 0 },
      errorCode: { type: ["string", "null"], maxLength: 100 },
      expiresAt: { type: ["string", "null"], format: "date-time" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  ReportExportJobResponse: {
    type: "object",
    required: ["data"],
    properties: { data: { $ref: "#/components/schemas/ReportExportJob" } },
  },
  ReportDownloadResponse: {
    type: "object",
    required: ["data"],
    properties: {
      data: {
        type: "object",
        required: ["url"],
        properties: {
          url: {
            type: "string",
            format: "uri",
            description:
              "Private temporary URL; available only until the 24-hour retention expiry.",
          },
        },
      },
    },
  },
};

const libraryIdParameter = { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^c[a-z0-9]{20,30}$" } };
const libraryPaths = {
  "/api/library": {
    get: {
      tags: ["Library"], security: cookieSecurity,
      description: "Lists operational library entries visible through GLOBAL, SEDE, AREA or active PROYECTO membership scope. Ordinary readers receive only effective published versions.",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
        { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        { name: "q", in: "query", schema: { type: "string", maxLength: 100 } },
        { name: "categoria", in: "query", schema: { $ref: "#/components/schemas/LibraryCategory" } },
        { name: "alcance", in: "query", schema: { $ref: "#/components/schemas/LibraryScope" } },
        { name: "estado", in: "query", description: "Workflow users only", schema: { $ref: "#/components/schemas/LibraryState" } },
        { name: "requiereAcuse", in: "query", schema: { type: "boolean" } },
      ],
      responses: { 200: { description: "Scoped library page", content: { "application/json": { schema: { $ref: "#/components/schemas/LibraryPageResponse" } } } }, ...errorResponses },
    },
    post: {
      tags: ["Library"], security: cookieSecurity,
      description: "Creates library metadata and immutable version 1 from an available private file owned by the actor. GLOBAL drafts are administrator-only.",
      requestBody: jsonBody({ $ref: "#/components/schemas/LibraryCreateInput" }),
      responses: { 201: { description: "Draft created", content: { "application/json": { schema: { $ref: "#/components/schemas/LibraryDocumentResponse" } } } }, ...errorResponses },
    },
  },
  "/api/library/{id}": {
    get: { tags: ["Library"], security: cookieSecurity, parameters: [libraryIdParameter], responses: { 200: { description: "Scoped document and version history", content: { "application/json": { schema: { $ref: "#/components/schemas/LibraryDocumentResponse" } } } }, ...errorResponses } },
  },
  "/api/library/{id}/versions": {
    post: { tags: ["Library"], security: cookieSecurity, parameters: [libraryIdParameter], description: "Adds a new immutable draft version. Only one BORRADOR or EN_REVISION version may exist per document.", requestBody: jsonBody({ $ref: "#/components/schemas/LibraryVersionCreateInput" }), responses: { 201: { description: "Version created", content: { "application/json": { schema: { $ref: "#/components/schemas/LibraryVersionResponse" } } } }, ...errorResponses } },
  },
  "/api/library/{id}/archive": {
    post: { tags: ["Library"], security: cookieSecurity, parameters: [libraryIdParameter], description: "Archives the entry and its non-archived versions. A reason is mandatory.", requestBody: jsonBody({ $ref: "#/components/schemas/LibraryArchiveInput" }), responses: { 200: { description: "Document archived", content: { "application/json": { schema: { $ref: "#/components/schemas/LibraryDocumentResponse" } } } }, ...errorResponses } },
  },
  "/api/library/versions/{id}/submit-review": {
    post: { tags: ["Library"], security: cookieSecurity, parameters: [libraryIdParameter], description: "Moves a draft to EN_REVISION.", responses: { 200: { description: "Version submitted", content: { "application/json": { schema: { $ref: "#/components/schemas/LibraryVersionResponse" } } } }, ...errorResponses } },
  },
  "/api/library/versions/{id}/review": {
    post: { tags: ["Library"], security: cookieSecurity, parameters: [libraryIdParameter], description: "Records an independent review. The author cannot review their own version; REQUEST_CHANGES returns it to BORRADOR.", requestBody: jsonBody({ $ref: "#/components/schemas/LibraryReviewInput" }), responses: { 200: { description: "Review recorded", content: { "application/json": { schema: { $ref: "#/components/schemas/LibraryVersionResponse" } } } }, ...errorResponses } },
  },
  "/api/library/versions/{id}/publish": {
    post: { tags: ["Library"], security: cookieSecurity, parameters: [libraryIdParameter], description: "Publishes an independently reviewed version. Replacing the prior publication requires motivoSustitucion and archives it atomically.", requestBody: jsonBody({ $ref: "#/components/schemas/LibraryPublishInput" }), responses: { 200: { description: "Version published", content: { "application/json": { schema: { $ref: "#/components/schemas/LibraryVersionResponse" } } } }, ...errorResponses } },
  },
  "/api/library/versions/{id}/download": {
    get: { tags: ["Library"], security: cookieSecurity, parameters: [libraryIdParameter], description: "Issues a short-lived private capability-bound URL for an effective publication or an authorized workflow participant.", responses: { 200: { description: "Private download URL", content: { "application/json": { schema: { $ref: "#/components/schemas/LibraryDownloadResponse" } } } }, ...errorResponses } },
  },
  "/api/library/versions/{id}/acknowledge": {
    post: { tags: ["Library"], security: cookieSecurity, parameters: [libraryIdParameter], description: "Idempotently records user, version and timestamp for a publication that requires acknowledgement. It is not a signature, legal acceptance or notification read receipt.", responses: { 200: { description: "Acknowledgement recorded", content: { "application/json": { schema: { $ref: "#/components/schemas/LibraryAcknowledgementResponse" } } } }, ...errorResponses } },
  },
};

const librarySchemas = {
  LibraryCategory: { type: "string", enum: ["MANUAL","PROCEDIMIENTO","REGLAMENTO","FORMATO","INSTRUCTIVO","PROTOCOLO","CAPACITACION","PLANTILLA","COMUNICADO_PERMANENTE","POLITICA"] },
  LibraryScope: { type: "string", enum: ["GLOBAL","SEDE","AREA","PROYECTO"] },
  LibraryState: { type: "string", enum: ["BORRADOR","EN_REVISION","PUBLICADO","ARCHIVADO"] },
  LibraryVersion: {
    type: "object", additionalProperties: false,
    required: ["id","documentoId","numero","estado","resumenCambios","autorId","createdAt"],
    properties: {
      id: { type: "string", pattern: "^c[a-z0-9]{20,30}$" }, documentoId: { type: "string", pattern: "^c[a-z0-9]{20,30}$" }, numero: { type: "integer", minimum: 1 }, estado: { $ref: "#/components/schemas/LibraryState" }, archivoId: { type: "string", pattern: "^[a-f0-9]{30}$" }, resumenCambios: { type: "string", maxLength: 2000 }, retroalimentacion: { type: ["string","null"], maxLength: 2000 }, motivoSustitucion: { type: ["string","null"], maxLength: 1000 }, vigenteDesde: { type: ["string","null"], format: "date-time" }, vigenteHasta: { type: ["string","null"], format: "date-time" }, autorId: { type: "integer" }, revisadoPorId: { type: ["integer","null"] }, publicadoPorId: { type: ["integer","null"] }, submittedAt: { type: ["string","null"], format: "date-time" }, reviewedAt: { type: ["string","null"], format: "date-time" }, publishedAt: { type: ["string","null"], format: "date-time" }, archivedAt: { type: ["string","null"], format: "date-time" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
    },
  },
  LibraryDocument: {
    type: "object", additionalProperties: false,
    required: ["id","titulo","categoria","alcance","estado","requiereAcuse","creadoPorId","createdAt","updatedAt"],
    properties: {
      id: { type: "string", pattern: "^c[a-z0-9]{20,30}$" }, titulo: { type: "string", maxLength: 191 }, descripcion: { type: ["string","null"], maxLength: 2000 }, categoria: { $ref: "#/components/schemas/LibraryCategory" }, alcance: { $ref: "#/components/schemas/LibraryScope" }, estado: { $ref: "#/components/schemas/LibraryState" }, requiereAcuse: { type: "boolean" }, sedeId: { type: ["integer","null"] }, areaId: { type: ["integer","null"] }, proyectoId: { type: ["string","null"] }, creadoPorId: { type: "integer" }, archivadoPorId: { type: ["integer","null"] }, motivoArchivo: { type: ["string","null"] }, archivadoAt: { type: ["string","null"], format: "date-time" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }, versiones: { type: "array", items: { $ref: "#/components/schemas/LibraryVersion" } },
    },
  },
  LibraryCreateInput: {
    type: "object", additionalProperties: false, required: ["titulo","categoria","alcance","archivoId","resumenCambios"],
    properties: { titulo: { type: "string", minLength: 1, maxLength: 191 }, descripcion: { type: "string", maxLength: 2000 }, categoria: { $ref: "#/components/schemas/LibraryCategory" }, alcance: { $ref: "#/components/schemas/LibraryScope" }, sedeId: { type: "integer", minimum: 1 }, areaId: { type: "integer", minimum: 1 }, proyectoId: { type: "string", pattern: "^c[a-z0-9]{20,30}$" }, requiereAcuse: { type: "boolean", default: false }, archivoId: { type: "string", pattern: "^[a-f0-9]{30}$" }, resumenCambios: { type: "string", minLength: 1, maxLength: 2000 }, vigenteDesde: { type: "string", format: "date-time" }, vigenteHasta: { type: "string", format: "date-time" } },
  },
  LibraryVersionCreateInput: { type: "object", additionalProperties: false, required: ["archivoId","resumenCambios"], properties: { archivoId: { type: "string", pattern: "^[a-f0-9]{30}$" }, resumenCambios: { type: "string", minLength: 1, maxLength: 2000 }, vigenteDesde: { type: "string", format: "date-time" }, vigenteHasta: { type: "string", format: "date-time" } } },
  LibraryReviewInput: { type: "object", additionalProperties: false, required: ["decision"], properties: { decision: { type: "string", enum: ["APPROVE","REQUEST_CHANGES"] }, retroalimentacion: { type: "string", maxLength: 2000 } } },
  LibraryPublishInput: { type: "object", additionalProperties: false, properties: { motivoSustitucion: { type: "string", minLength: 1, maxLength: 1000 } } },
  LibraryArchiveInput: { type: "object", additionalProperties: false, required: ["motivo"], properties: { motivo: { type: "string", minLength: 1, maxLength: 1000 } } },
  LibraryDocumentResponse: { type: "object", required: ["data"], properties: { data: { $ref: "#/components/schemas/LibraryDocument" } } },
  LibraryVersionResponse: { type: "object", required: ["data"], properties: { data: { $ref: "#/components/schemas/LibraryVersion" } } },
  LibraryPageResponse: { type: "object", required: ["data"], properties: { data: { type: "object", required: ["items","page","pageSize","total"], properties: { items: { type: "array", items: { $ref: "#/components/schemas/LibraryDocument" } }, page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" } } } } },
  LibraryDownloadResponse: { type: "object", required: ["data"], properties: { data: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" }, expiresIn: { type: "integer", maximum: 300 } } } } },
  LibraryAcknowledgementResponse: { type: "object", required: ["data"], properties: { data: { type: "object", required: ["id","versionId","usuarioId","acknowledgedAt"], properties: { id: { type: "string", pattern: "^c[a-z0-9]{20,30}$" }, versionId: { type: "string", pattern: "^c[a-z0-9]{20,30}$" }, usuarioId: { type: "integer" }, acknowledgedAt: { type: "string", format: "date-time" } } } } },
};

const publicContentIdParameter = { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^c[a-z0-9]{20,30}$" } };
const publicContentPaths = {
  "/api/public-content/pages/{slug}": {
    get: { tags: ["Public Content"], security: [], description: "Returns the current published version of one approved public page. It never exposes authors, publishers, private file keys or internal records.", parameters: [{ name: "slug", in: "path", required: true, schema: { $ref: "#/components/schemas/PublicPageSlug" } }], responses: { 200: { description: "Published page rendered from controlled blocks", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicPageResponse" } } } }, 404: { description: "No published page exists" } } },
  },
  "/api/public-content/faq": {
    get: { tags: ["Public Content"], security: [], description: "Returns only FAQ blocks from the published Preguntas frecuentes page.", responses: { 200: { description: "Published FAQ", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicPageResponse" } } } }, 404: { description: "No published FAQ exists" } } },
  },
  "/api/public-content/assets/{id}": {
    get: { tags: ["Public Content"], security: [], description: "Returns a short-lived inline URL from the dedicated public bucket. Private/quarantine URLs are never reused.", parameters: [publicContentIdParameter], responses: { 200: { description: "Public asset access", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicAssetAccessResponse" } } } }, 404: { description: "Public asset not found" } } },
  },
  "/api/public-content/admin/pages": {
    get: { tags: ["Public Content"], security: cookieSecurity, description: "Lists public-page workflow records for authorized draft editors.", parameters: [{ name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } }, { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } }, { name: "estado", in: "query", schema: { $ref: "#/components/schemas/PublicContentState" } }], responses: { 200: { description: "CMS page", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicAdminPageListResponse" } } } }, ...errorResponses } },
    post: { tags: ["Public Content"], security: cookieSecurity, description: "Creates one approved public page and immutable draft version 1 using only controlled blocks.", requestBody: jsonBody({ $ref: "#/components/schemas/PublicContentCreateInput" }), responses: { 201: { description: "Draft page created" }, ...errorResponses } },
  },
  "/api/public-content/admin/pages/{id}": {
    get: { tags: ["Public Content"], security: cookieSecurity, parameters: [publicContentIdParameter], responses: { 200: { description: "Complete CMS version history" }, ...errorResponses } },
  },
  "/api/public-content/admin/pages/{id}/versions": {
    post: { tags: ["Public Content"], security: cookieSecurity, parameters: [publicContentIdParameter], description: "Creates a new immutable draft. A page may have only one open draft.", requestBody: jsonBody({ $ref: "#/components/schemas/PublicContentVersionInput" }), responses: { 201: { description: "Draft version created" }, ...errorResponses } },
  },
  "/api/public-content/admin/versions/{id}/publish": {
    post: { tags: ["Public Content"], security: cookieSecurity, parameters: [publicContentIdParameter], description: "Administrator-only atomic publication. The previous publication is archived and author, publisher, date, version and change summary are retained.", responses: { 200: { description: "Version published" }, ...errorResponses } },
  },
  "/api/public-content/admin/pages/{id}/archive": {
    post: { tags: ["Public Content"], security: cookieSecurity, parameters: [publicContentIdParameter], description: "Administrator-only page withdrawal with a mandatory reason.", requestBody: jsonBody({ $ref: "#/components/schemas/PublicContentArchiveInput" }), responses: { 200: { description: "Page archived" }, ...errorResponses } },
  },
  "/api/public-content/admin/assets": {
    post: { tags: ["Public Content"], security: cookieSecurity, description: "Explicitly classifies an owned, scanned JPG/PNG as public and copies it into the isolated public bucket.", requestBody: jsonBody({ $ref: "#/components/schemas/PublicAssetClassifyInput" }), responses: { 201: { description: "Asset classified as public" }, ...errorResponses } },
  },
  "/api/public-content/admin/assets/{id}/archive": {
    post: { tags: ["Public Content"], security: cookieSecurity, parameters: [publicContentIdParameter], description: "Administrator-only public-asset withdrawal. Assets used by a published page cannot be archived.", requestBody: jsonBody({ $ref: "#/components/schemas/PublicContentArchiveInput" }), responses: { 200: { description: "Asset archived" }, ...errorResponses } },
  },
};

const publicContentSchemas = {
  PublicPageSlug: { type: "string", enum: ["inicio", "servicio-social", "preguntas-frecuentes", "acerca-de-ares", "contacto", "informacion-legal"] },
  PublicContentState: { type: "string", enum: ["BORRADOR", "PUBLICADO", "ARCHIVADO"] },
  PublicContentBlock: {
    oneOf: [
      { type: "object", additionalProperties: false, required: ["orden","tipo","contenido"], properties: { orden: { type: "integer", minimum: 0, maximum: 999 }, tipo: { const: "TEXTO" }, contenido: { type: "object", additionalProperties: false, required: ["texto"], properties: { texto: { type: "string", minLength: 1, maxLength: 10000 } } } } },
      { type: "object", additionalProperties: false, required: ["orden","tipo","contenido"], properties: { orden: { type: "integer", minimum: 0, maximum: 999 }, tipo: { const: "ENCABEZADO" }, contenido: { type: "object", additionalProperties: false, required: ["texto","nivel"], properties: { texto: { type: "string", minLength: 1, maxLength: 300 }, nivel: { type: "integer", minimum: 1, maximum: 6 } } } } },
      { type: "object", additionalProperties: false, required: ["orden","tipo","contenido"], properties: { orden: { type: "integer", minimum: 0, maximum: 999 }, tipo: { const: "LISTA" }, contenido: { type: "object", additionalProperties: false, required: ["elementos"], properties: { elementos: { type: "array", minItems: 1, maxItems: 50, items: { type: "string", minLength: 1, maxLength: 500 } }, ordenada: { type: "boolean", default: false } } } } },
      { type: "object", additionalProperties: false, required: ["orden","tipo","contenido"], properties: { orden: { type: "integer", minimum: 0, maximum: 999 }, tipo: { const: "ENLACE" }, contenido: { type: "object", additionalProperties: false, required: ["etiqueta","url"], properties: { etiqueta: { type: "string", minLength: 1, maxLength: 200 }, url: { type: "string", maxLength: 2048, description: "Absolute HTTPS or root-relative URL; HTTP, javascript and data schemes are rejected" }, nuevaVentana: { type: "boolean", default: false } } } } },
      { type: "object", additionalProperties: false, required: ["orden","tipo","contenido"], properties: { orden: { type: "integer", minimum: 0, maximum: 999 }, tipo: { const: "AVISO" }, contenido: { type: "object", additionalProperties: false, required: ["texto"], properties: { titulo: { type: "string", maxLength: 200 }, texto: { type: "string", minLength: 1, maxLength: 2000 }, tono: { type: "string", enum: ["INFORMATIVO","ADVERTENCIA","EXITO"], default: "INFORMATIVO" } } } } },
      { type: "object", additionalProperties: false, required: ["orden","tipo","activoPublicoId","contenido"], properties: { orden: { type: "integer", minimum: 0, maximum: 999 }, tipo: { const: "IMAGEN" }, activoPublicoId: { type: "string", pattern: "^c[a-z0-9]{20,30}$" }, contenido: { type: "object", additionalProperties: false, required: ["alt"], properties: { alt: { type: "string", minLength: 1, maxLength: 300 }, pie: { type: "string", maxLength: 500 } } } } },
      { type: "object", additionalProperties: false, required: ["orden","tipo","contenido"], properties: { orden: { type: "integer", minimum: 0, maximum: 999 }, tipo: { const: "FAQ" }, contenido: { type: "object", additionalProperties: false, required: ["pregunta","respuesta"], properties: { pregunta: { type: "string", minLength: 1, maxLength: 500 }, respuesta: { type: "string", minLength: 1, maxLength: 5000 } } } } },
    ],
  },
  PublicContentVersionInput: { type: "object", additionalProperties: false, required: ["titulo","resumenCambios","bloques"], properties: { titulo: { type: "string", minLength: 1, maxLength: 191 }, resumenCambios: { type: "string", minLength: 1, maxLength: 2000 }, seoTitulo: { type: "string", maxLength: 191 }, seoDescripcion: { type: "string", maxLength: 500 }, bloques: { type: "array", minItems: 1, maxItems: 100, items: { $ref: "#/components/schemas/PublicContentBlock" } } } },
  PublicContentCreateInput: { allOf: [{ $ref: "#/components/schemas/PublicContentVersionInput" }, { type: "object", required: ["slug"], properties: { slug: { $ref: "#/components/schemas/PublicPageSlug" } } }] },
  PublicContentArchiveInput: { type: "object", additionalProperties: false, required: ["motivo"], properties: { motivo: { type: "string", minLength: 1, maxLength: 1000 } } },
  PublicAssetClassifyInput: { type: "object", additionalProperties: false, required: ["archivoId"], properties: { archivoId: { type: "string", pattern: "^c[a-z0-9]{20,30}$" } } },
  PublicPageResponse: { type: "object", required: ["data"], properties: { data: { type: "object", additionalProperties: false, required: ["slug","titulo","estado","metadata","bloques"], properties: { slug: { $ref: "#/components/schemas/PublicPageSlug" }, titulo: { type: "string" }, estado: { const: "PUBLICADO" }, metadata: { type: "object", required: ["version","resumenCambios","publishedAt"], properties: { version: { type: "integer", minimum: 1 }, resumenCambios: { type: "string" }, publishedAt: { type: "string", format: "date-time" }, seoTitulo: { type: ["string","null"] }, seoDescripcion: { type: ["string","null"] } } }, bloques: { type: "array", items: { type: "object" } } } } } },
  PublicAssetAccessResponse: { type: "object", required: ["data"], properties: { data: { type: "object", required: ["id","url","expiresIn","mime"], properties: { id: { type: "string" }, url: { type: "string", format: "uri" }, expiresIn: { type: "integer", maximum: 900 }, mime: { type: "string", enum: ["image/jpeg","image/png"] } } } } },
  PublicAdminPageListResponse: { type: "object", required: ["data"], properties: { data: { type: "object", required: ["items","total","page","pageSize"], properties: { items: { type: "array", items: { type: "object" } }, total: { type: "integer", minimum: 0 }, page: { type: "integer", minimum: 1 }, pageSize: { type: "integer", minimum: 1, maximum: 100 } } } } },
};

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
  "/api/kairos/projects/{projectId}/kanban": {
    get: {
      tags: ["Kairos Kanban"], security: cookieSecurity,
      description: "Read-only Kanban projection over the project's Kairos activities. It does not create a second workflow domain or move cards; mutations must use the activity transition endpoints. Active members may read archived projects.",
      parameters: [
        { name: "projectId", in: "path", required: true, schema: { type: "string", minLength: 21, maxLength: 31, pattern: "^c[a-z0-9]{20,30}$" }, description: "Prisma CUID project identifier" },
        { name: "responsableId", in: "query", schema: { type: "integer", minimum: 1 } },
        { name: "participantId", in: "query", schema: { type: "integer", minimum: 1 } },
        { name: "priority", in: "query", schema: { type: "string", enum: ["BAJA", "MEDIA", "ALTA", "CRITICA"] } },
        { name: "complexity", in: "query", schema: { type: "string", enum: ["BAJA", "MEDIA", "ALTA"] } },
        { name: "vencida", in: "query", schema: { type: "boolean" }, description: "Derived overdue filter: dueAt is past and state is not TERMINADA or CANCELADA" },
        { name: "limitPerLane", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 }, description: "Maximum cards returned in each lane; totals remain untruncated" },
      ],
      responses: { 200: { description: "Seven canonical activity lanes with safe card projections, total per lane and generated timestamp; archived projects remain readable to active members", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosKanbanResponse" } } } }, ...errorResponses },
    },
  },
  "/api/kairos/projects/{projectId}/activities": {
    get: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", minLength: 1, pattern: "^[a-z0-9]+$" } }], responses: { 200: { description: "Activities visible to an active project member, including historical activities in archived projects; vencida is derived from dueAt and state", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosActivityListResponse" } } } }, ...errorResponses } },
    post: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", minLength: 1, pattern: "^[a-z0-9]+$" } }], requestBody: jsonBody({ $ref: "#/components/schemas/KairosActivityInput" }), responses: { 201: { description: "Activity created in PENDIENTE", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosActivityResponse" } } } }, ...errorResponses } },
  },
  "/api/kairos/projects/{projectId}/activities/{id}": {
    get: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }, { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }], responses: { 200: { description: "Activity detail with derived vencida; archived project history remains readable", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosActivityResponse" } } } }, ...errorResponses } },
    patch: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }, { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }], requestBody: jsonBody({ $ref: "#/components/schemas/KairosActivityUpdateInput" }), responses: { 200: { description: "Pending activity updated", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosActivityResponse" } } } }, ...errorResponses } },
  },
  "/api/kairos/projects/{projectId}/activities/{id}/transition": { post: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }, { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }], requestBody: jsonBody({ $ref: "#/components/schemas/KairosActivityTransitionInput" }), responses: { 200: { description: "Activity state transitioned and history appended", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosActivityResponse" } } } }, ...errorResponses } } },
  "/api/kairos/projects/{projectId}/activities/{id}/submit": { post: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }, { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }], requestBody: jsonBody({ $ref: "#/components/schemas/KairosActivitySubmitInput" }), responses: { 200: { description: "Immutable evidence delivery created; activity enters EN_REVISION", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosEvidenceResponse" } } } }, ...errorResponses } } },
  "/api/kairos/projects/{projectId}/activities/{id}/review": { post: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }, { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }], requestBody: jsonBody({ $ref: "#/components/schemas/KairosActivityReviewInput" }), responses: { 200: { description: "Activity reviewed by a manager different from the responsible user", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosActivityResponse" } } } }, ...errorResponses } } },
  "/api/kairos/projects/{projectId}/activities/{id}/reopen": { post: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }, { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }], requestBody: jsonBody({ $ref: "#/components/schemas/KairosActivityReopenInput" }), responses: { 200: { description: "Closed activity reopened with mandatory reason", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosActivityResponse" } } } }, ...errorResponses } } },
  "/api/kairos/projects/{projectId}/activities/{id}/history": { get: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$" } }, { name: "id", in: "path", required: true, schema: { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$" } }, { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } }, { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } }], responses: { 200: { description: "Paginated immutable activity history, including archived projects", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosActivityHistoryResponse" } } } }, ...errorResponses } } },
  "/api/kairos/projects/{projectId}/activities/{id}/evidence/{evidenceId}/download": { get: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }, { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }, { name: "evidenceId", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }], responses: { 200: { description: "Short-lived authorized evidence download URL; archived project evidence remains downloadable to an active member", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosDownloadResponse" } } } }, ...errorResponses } } },
  "/api/kairos/projects/{projectId}/activities/{id}/evidence": { get: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$" } }, { name: "id", in: "path", required: true, schema: { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$" } }, { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } }, { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } }], responses: { 200: { description: "Paginated immutable evidence deliveries; readable by active members including archived projects", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosEvidencePageResponse" } } } }, ...errorResponses } } },
  "/api/kairos/projects/{projectId}/activities/{id}/comments": {
    post: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }, { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9]+$" } }], requestBody: jsonBody({ $ref: "#/components/schemas/KairosActivityCommentInput" }), responses: { 201: { description: "Comment added", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosCommentResponse" } } } }, ...errorResponses } },
    get: { tags: ["Kairos Activities"], security: cookieSecurity, parameters: [{ name: "projectId", in: "path", required: true, schema: { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$" } }, { name: "id", in: "path", required: true, schema: { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$" } }, { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } }, { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } }], responses: { 200: { description: "Paginated activity comments; readable by active members including archived projects", content: { "application/json": { schema: { $ref: "#/components/schemas/KairosCommentPageResponse" } } } }, ...errorResponses } }
  },
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
  KairosKanbanCard: { type: "object", additionalProperties: false, required: ["id", "title", "state", "priority", "complexity", "responsable", "startAt", "dueAt", "closedAt", "vencida", "participantCount", "createdAt"], properties: { id: { type: "string", minLength: 21, maxLength: 31, pattern: "^c[a-z0-9]{20,30}$" }, title: { type: "string" }, state: { type: "string", enum: ["PENDIENTE", "EN_PROGRESO", "BLOQUEADA", "EN_REVISION", "REQUIERE_CORRECCION", "TERMINADA", "CANCELADA"] }, priority: { type: "string", enum: ["BAJA", "MEDIA", "ALTA", "CRITICA"] }, complexity: { type: "string", enum: ["BAJA", "MEDIA", "ALTA"] }, responsable: { type: "object", additionalProperties: false, required: ["id", "codigo"], properties: { id: { type: "integer", minimum: 1 }, codigo: { type: "string" } } }, startAt: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] }, dueAt: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] }, closedAt: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] }, vencida: { type: "boolean", description: "Derived from dueAt and state; never persisted as workflow state" }, participantCount: { type: "integer", minimum: 0 }, createdAt: { type: "string", format: "date-time" } } },
  KairosKanbanLane: { type: "object", additionalProperties: false, required: ["state", "total", "items"], properties: { state: { type: "string", enum: ["PENDIENTE", "EN_PROGRESO", "BLOQUEADA", "EN_REVISION", "REQUIERE_CORRECCION", "TERMINADA", "CANCELADA"] }, total: { type: "integer", minimum: 0, description: "Total matching cards before limitPerLane truncation" }, items: { type: "array", items: { $ref: "#/components/schemas/KairosKanbanCard" } } } },
  KairosKanban: { type: "object", additionalProperties: false, required: ["projectId", "generatedAt", "lanes"], properties: { projectId: { type: "string", minLength: 21, maxLength: 31, pattern: "^c[a-z0-9]{20,30}$" }, generatedAt: { type: "string", format: "date-time" }, lanes: { type: "array", minItems: 7, maxItems: 7, items: { $ref: "#/components/schemas/KairosKanbanLane" }, description: "Exactly seven canonical lanes in workflow order" } } },
  KairosKanbanResponse: { type: "object", additionalProperties: false, required: ["data"], properties: { data: { $ref: "#/components/schemas/KairosKanban" } } },
  KairosActivityInput: { type: "object", required: ["title", "responsableId"], additionalProperties: false, properties: { title: { type: "string", minLength: 1, maxLength: 191 }, description: { type: ["string", "null"], maxLength: 3000 }, startAt: { type: "string", format: "date-time" }, dueAt: { type: "string", format: "date-time" }, priority: { type: "string", enum: ["BAJA", "MEDIA", "ALTA", "CRITICA"] }, complexity: { type: "string", enum: ["BAJA", "MEDIA", "ALTA"] }, responsableId: { type: "integer", minimum: 1 }, participantIds: { type: "array", maxItems: 100, items: { type: "integer", minimum: 1 } } } },
  KairosActivityUpdateInput: { type: "object", minProperties: 1, additionalProperties: false, description: "Partial update; at least one property is required.", properties: { title: { type: "string", minLength: 1, maxLength: 191 }, description: { type: ["string", "null"], maxLength: 3000 }, startAt: { type: "string", format: "date-time" }, dueAt: { type: "string", format: "date-time" }, priority: { type: "string", enum: ["BAJA", "MEDIA", "ALTA", "CRITICA"] }, complexity: { type: "string", enum: ["BAJA", "MEDIA", "ALTA"] }, responsableId: { type: "integer", minimum: 1 }, participantIds: { type: "array", maxItems: 100, items: { type: "integer", minimum: 1 } } } },
  KairosActivityTransitionInput: { type: "object", required: ["state"], additionalProperties: false, properties: { state: { type: "string", enum: ["EN_PROGRESO", "BLOQUEADA", "CANCELADA"] }, comment: { type: "string", maxLength: 2000 } } },
  KairosActivitySubmitInput: { type: "object", required: ["archivoId"], additionalProperties: false, properties: { archivoId: { type: "string", minLength: 30, maxLength: 30, pattern: "^[a-f0-9]{30}$" }, comment: { type: "string", maxLength: 1000 } } },
  KairosActivityReviewInput: { type: "object", required: ["state"], additionalProperties: false, properties: { state: { type: "string", enum: ["TERMINADA", "REQUIERE_CORRECCION"] }, comment: { type: "string", maxLength: 2000, description: "Required for REQUIERE_CORRECCION." } } },
  KairosActivityReopenInput: { type: "object", required: ["reason"], additionalProperties: false, properties: { reason: { type: "string", minLength: 1, maxLength: 2000 } } },
  KairosActivityCommentInput: { type: "object", required: ["body"], additionalProperties: false, properties: { body: { type: "string", minLength: 1, maxLength: 2000 } } },
  KairosActivity: { type: "object", properties: { id: { type: "string" }, proyectoId: { type: "string" }, title: { type: "string" }, description: { type: ["string", "null"] }, startAt: { type: ["string", "null"], format: "date-time" }, dueAt: { type: ["string", "null"], format: "date-time" }, closedAt: { type: ["string", "null"], format: "date-time" }, priority: { type: "string", enum: ["BAJA", "MEDIA", "ALTA", "CRITICA"] }, complexity: { type: "string", enum: ["BAJA", "MEDIA", "ALTA"] }, state: { type: "string", enum: ["PENDIENTE", "EN_PROGRESO", "BLOQUEADA", "EN_REVISION", "REQUIERE_CORRECCION", "TERMINADA", "CANCELADA"] }, responsable: { type: "object" }, participants: { type: "array", items: { type: "object" } }, vencida: { type: "boolean", description: "Derived: dueAt is past and state is not TERMINADA or CANCELADA." } } },
  KairosEvidence: { type: "object", properties: { id: { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$" }, actividadId: { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$" }, archivoId: { type: "string", minLength: 30, maxLength: 30, pattern: "^[a-f0-9]{30}$" }, authorId: { type: "integer" }, version: { type: "integer", minimum: 1 }, comment: { type: ["string", "null"] }, createdAt: { type: "string", format: "date-time" } } },
  KairosActivityResponse: { type: "object", properties: { data: { $ref: "#/components/schemas/KairosActivity" } } },
  KairosActivityListResponse: { type: "object", properties: { data: { type: "object", required: ["items", "total"], properties: { items: { type: "array", items: { $ref: "#/components/schemas/KairosActivity" } }, total: { type: "integer" } } } } },
  KairosEvidenceResponse: { type: "object", properties: { data: { $ref: "#/components/schemas/KairosEvidence" } } },
  KairosActivityHistoryResponse: { type: "object", additionalProperties: false, required: ["data"], properties: { data: { type: "object", additionalProperties: false, required: ["items", "total", "page", "pageSize"], properties: { items: { type: "array", items: { $ref: "#/components/schemas/KairosActivityHistoryItem" } }, total: { type: "integer", minimum: 0 }, page: { type: "integer", minimum: 1 }, pageSize: { type: "integer", minimum: 1, maximum: 100 } } } } },
  KairosActivityHistoryItem: { type: "object", additionalProperties: false, properties: { id: { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$" }, actividadId: { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$" }, actorId: { type: "integer" }, type: { type: "string" }, fromState: { type: ["string", "null"] }, toState: { type: ["string", "null"] }, comment: { type: ["string", "null"] }, evidenceId: { type: ["string", "null"] }, createdAt: { type: "string", format: "date-time" } } },
  KairosDownloadResponse: { type: "object", properties: { data: { type: "string", format: "uri" } } },
  KairosCommentResponse: { type: "object", properties: { data: { type: "object", properties: { id: { type: "string" }, body: { type: "string" }, author: { type: "object" }, createdAt: { type: "string", format: "date-time" } } } } },
};

const storageSchemas = {
  FileMetadata: { type: "object", additionalProperties: false, required: ["id", "status", "originalName", "detectedMime", "sizeBytes", "createdAt", "updatedAt"], properties: { id: { type: "string", minLength: 30, maxLength: 30, pattern: "^[a-f0-9]{30}$", description: "30-character lowercase hexadecimal id of the private file" }, status: { type: "string", enum: ["RECIBIDO", "PENDIENTE_ANALISIS", "ANALIZANDO", "DISPONIBLE", "RECHAZADO", "ERROR_ANALISIS", "ELIMINADO"], description: "Asynchronous malware scan lifecycle" }, originalName: { type: "string", maxLength: 255 }, detectedMime: { anyOf: [{ type: "string", maxLength: 150 }, { type: "null" }] }, sizeBytes: { type: "integer", format: "int64", minimum: 1 }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } },
  FileResponse: { type: "object", additionalProperties: false, required: ["data"], properties: { data: { $ref: "#/components/schemas/FileMetadata" } } },
  KairosEvidencePage: { type: "object", additionalProperties: false, required: ["items", "total", "page", "pageSize"], properties: { items: { type: "array", items: { $ref: "#/components/schemas/KairosEvidence" } }, total: { type: "integer", minimum: 0 }, page: { type: "integer", minimum: 1 }, pageSize: { type: "integer", minimum: 1, maximum: 100 } } },
  KairosEvidencePageResponse: { type: "object", additionalProperties: false, required: ["data"], properties: { data: { $ref: "#/components/schemas/KairosEvidencePage" } } },
  KairosComment: { type: "object", additionalProperties: false, required: ["id", "body", "createdAt", "author"], properties: { id: { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$" }, body: { type: "string", maxLength: 2000 }, createdAt: { type: "string", format: "date-time" }, author: { type: "object", additionalProperties: false, required: ["id", "codigo"], properties: { id: { type: "integer", minimum: 1 }, codigo: { type: "string", maxLength: 50 } } } } },
  KairosCommentPage: { type: "object", additionalProperties: false, required: ["items", "total", "page", "pageSize"], properties: { items: { type: "array", items: { $ref: "#/components/schemas/KairosComment" } }, total: { type: "integer", minimum: 0 }, page: { type: "integer", minimum: 1 }, pageSize: { type: "integer", minimum: 1, maximum: 100 } } },
  KairosCommentPageResponse: { type: "object", additionalProperties: false, required: ["data"], properties: { data: { $ref: "#/components/schemas/KairosCommentPage" } } },
};

function normalizeKairosPathParameters(paths: Record<string, any>) {
  for (const [path, operations] of Object.entries(paths)) {
    if (!path.startsWith("/api/kairos/")) continue;
    for (const operation of Object.values(operations as Record<string, any>)) {
      for (const parameter of operation.parameters ?? []) {
        if (parameter.name === "userId") parameter.schema = { type: "integer", minimum: 1 };
        if (["id", "projectId", "evidenceId"].includes(parameter.name)) parameter.schema = { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$", description: "CUID" };
        if (path.endsWith("/kanban") && parameter.name === "projectId") parameter.schema = { type: "string", minLength: 21, maxLength: 31, pattern: "^c[a-z0-9]{20,30}$", description: "Prisma CUID" };
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
  DocumentUploadInput: { type: "object", required: ["requisitoId", "archivoId"], additionalProperties: false, properties: { requisitoId: { type: "integer", minimum: 1 }, archivoId: { type: "string", minLength: 30, maxLength: 30, pattern: "^[a-f0-9]{30}$", description: "Previously scanned/available Archivo id; upload is linked to this stored object." } } },
  DocumentReviewInput: {
    oneOf: [
      { type: "object", required: ["estado"], additionalProperties: false, properties: { estado: { const: "AUTORIZADO" }, comentario: { type: "string", maxLength: 1000 } } },
      { type: "object", required: ["estado", "comentario"], additionalProperties: false, properties: { estado: { const: "RECHAZADO" }, comentario: { type: "string", minLength: 1, maxLength: 1000 } } },
      { type: "object", required: ["estado", "comentario"], additionalProperties: false, properties: { estado: { const: "REQUIERE_CORRECCION" }, comentario: { type: "string", minLength: 1, maxLength: 1000 } } },
    ],
    description: "comentario is optional for AUTORIZADO and required, non-empty, for RECHAZADO or REQUIERE_CORRECCION.",
  },
  DocumentRequirement: { type: "object", properties: { id: { type: "integer" }, usuarioId: { type: "integer" }, codigo: { type: "string" }, nombre: { type: "string" }, obligatorio: { type: "boolean" }, activo: { type: "boolean" }, versiones: { type: "array", items: { $ref: "#/components/schemas/DocumentVersion" } } } },
  DocumentVersion: { type: "object", properties: { id: { type: "string", minLength: 20, maxLength: 30, pattern: "^[a-z0-9]+$" }, requisitoId: { type: "integer" }, archivoId: { type: "string", minLength: 30, maxLength: 30, pattern: "^[a-f0-9]{30}$" }, version: { type: "integer" }, estado: { type: "string", enum: ["EN_REVISION", "AUTORIZADO", "RECHAZADO", "REQUIERE_CORRECCION"] }, comentario: { type: ["string", "null"] }, cargadoPorId: { type: "integer" }, revisadoPorId: { type: ["integer", "null"] } } },
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
      { name: "Directory", description: "Privacy-filtered active user directory and personal visibility preferences" },
      { name: "Files", description: "Private multipart uploads and asynchronous malware analysis status" },
      { name: "Public Content", description: "Versioned public CMS with controlled blocks and isolated public assets" },
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
      ...storagePaths,
      ...directoryPaths,
      ...reportsPaths,
      ...libraryPaths,
      ...publicContentPaths,
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
        ...directorySchemas,
        ...storageSchemas,
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
        ...reportsSchemas,
        ...librarySchemas,
        ...publicContentSchemas,
      },
    },
  } as const;
}
