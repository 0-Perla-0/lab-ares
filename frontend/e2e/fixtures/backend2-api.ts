import type { Page, Request, Route } from "@playwright/test";

export type Backend2MockOptions = {
  gamificationDisabled?: boolean;
  printingDisabled?: boolean;
  reportExport?: "sync" | "async";
};

export type Backend2MockState = {
  requests: Array<{ method: string; path: string; body: unknown }>;
  filePolls: number;
  reportPolls: number;
};

const now = "2026-09-27T12:00:00.000Z";
const pageResult = <T>(items: T[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
});

const permissions = {
  "academic:profile:read": "global",
  "academic:profile:update": "global",
  "academic:catalog:manage": "global",
  "documents:read": "global",
  "documents:upload": "global",
  "documents:review": "global",
  "directory:read": "global",
  "kairos:project:create": "global",
  "reports:read": "global",
  "reports:export": "global",
  "library:read": "global",
  "library:draft:create": "global",
  "library:review": "global",
  "library:publish": "global",
  "library:archive": "global",
  "library:acknowledge": "global",
  "public-content:draft": "global",
  "public-content:publish": "global",
  "public-content:archive": "global",
  "gamification:read": "global",
  "gamification:manage": "global",
  "printing-3d:request": "global",
  "printing-3d:operate": "global",
  "printing-3d:manage": "global",
  "retention:request": "global",
  "retention:read": "global",
  "retention:manage": "global",
  "retention:execute": "global",
};

const user = {
  id: 1,
  codigo: "ADMIN001",
  email: "admin@ares.test",
  rol: "ADMIN",
  estado: "ACTIVO",
  sedeId: 1,
  areaId: 1,
  turnoId: 1,
  permissions,
};

async function requestBody(request: Request) {
  if (!request.postData()) return null;
  try {
    return request.postDataJSON();
  } catch {
    return request.postData();
  }
}

const envelope = (data: unknown) => ({ data });

async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
}

export async function installBackend2Api(
  page: Page,
  options: Backend2MockOptions = {},
): Promise<Backend2MockState> {
  const state: Backend2MockState = {
    requests: [],
    filePolls: 0,
    reportPolls: 0,
  };
  const project = {
    id: "project-1",
    nombre: "Portal ARES",
    descripcion: "Entrega Backend 2",
    estado: "ACTIVO",
    prioridad: "ALTA",
    creadoPorId: 1,
    createdAt: now,
    updatedAt: now,
    rol: "PROPIETARIO",
    favorito: true,
    miembros: [
      {
        usuarioId: 1,
        rol: "PROPIETARIO",
        createdAt: now,
        usuario: { id: 1, codigo: "ADMIN001" },
      },
    ],
  };
  const activity = {
    id: "activity-1",
    proyectoId: project.id,
    title: "Validar E2E",
    description: "Cubrir el tablero",
    state: "PENDIENTE",
    priority: "ALTA",
    complexity: "MEDIA",
    startAt: null,
    dueAt: "2026-10-01T12:00:00.000Z",
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    responsable: { id: 1, codigo: "ADMIN001" },
    participants: [],
  };
  const academicProfile = {
    id: 11,
    usuarioId: 1,
    institucionId: 1,
    unidadAcademicaId: 2,
    programaAcademicoId: 3,
    cohorteId: 4,
    inicio: "2026-01-10",
    fin: null,
    vigente: true,
    estado: "APROBADO",
    createdAt: now,
    institucion: { id: 1, nombre: "Universidad ARES" },
    unidadAcademica: { id: 2, nombre: "Ingeniería" },
    programaAcademico: { id: 3, nombre: "Software" },
    cohorte: { id: 4, nombre: "2026-A" },
  };
  const documentRequirement = {
    id: 21,
    usuarioId: 1,
    codigo: "IDENTIFICACION",
    nombre: "Identificación oficial",
    obligatorio: true,
    activo: true,
    createdAt: now,
    updatedAt: now,
    versiones: [],
  };
  const privateFile = {
    id: "file-1",
    status: "PENDIENTE_ANALISIS",
    originalName: "evidencia.pdf",
    detectedMime: "application/pdf",
    sizeBytes: 18,
    createdAt: now,
    updatedAt: now,
  };
  const libraryDocument = {
    id: "library-1",
    titulo: "Manual institucional",
    descripcion: "Procedimientos vigentes",
    categoria: "MANUAL",
    alcance: "GLOBAL",
    estado: "PUBLICADO",
    requiereAcuse: true,
    createdAt: now,
    updatedAt: now,
    versiones: [
      {
        id: "library-version-1",
        numero: 1,
        estado: "PUBLICADO",
        resumenCambios: "Versión inicial",
        vigenteDesde: now,
        vigenteHasta: null,
        retroalimentacion: null,
        createdAt: now,
        archivo: {
          id: "file-library",
          originalName: "manual.pdf",
          detectedMime: "application/pdf",
          sizeBytes: 1200,
          status: "DISPONIBLE",
        },
      },
    ],
  };
  const publicPage = {
    id: "page-1",
    slug: "servicio-social",
    estado: "PUBLICADO",
    updatedAt: now,
    versiones: [
      {
        id: "public-version-1",
        numero: 1,
        estado: "PUBLICADO",
        titulo: "Servicio social",
        resumenCambios: "Publicación inicial",
        seoTitulo: "Servicio social ARES",
        seoDescripcion: "Información segura",
        createdAt: now,
        publishedAt: now,
        bloques: [
          {
            tipo: "TEXTO",
            orden: 0,
            contenido: {
              texto:
                '<img id="injected" src=x onerror=alert(1)> contenido seguro',
            },
          },
        ],
      },
    ],
  };
  const printingJob = {
    id: "print-1",
    descripcion: "Prototipo",
    estado: "SOLICITADO",
    solicitante: { id: 1, codigo: "ADMIN001" },
    operadorAsignado: null,
    revisadoPor: null,
    archivo: {
      id: "file-stl",
      originalName: "pieza.stl",
      detectedMime: "model/stl",
      status: "DISPONIBLE",
    },
    ejecuciones: [],
    createdAt: now,
    updatedAt: now,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;
    const body = await requestBody(request);
    state.requests.push({ method, path, body });

    if (path === "/api/auth/me") return json(route, envelope(user));
    if (path === "/api/auth/logout") return json(route, envelope({ ok: true }));

    if (path === "/api/academic/catalogs") {
      return json(
        route,
        envelope({
          page: 1,
          pageSize: 100,
          instituciones: {
            items: [{ id: 1, nombre: "Universidad ARES", activa: true }],
            total: 1,
          },
          unidades: {
            items: [
              {
                id: 2,
                nombre: "Ingeniería",
                institucionId: 1,
                activa: true,
              },
            ],
            total: 1,
          },
          programas: {
            items: [
              {
                id: 3,
                nombre: "Software",
                unidadAcademicaId: 2,
                activa: true,
              },
            ],
            total: 1,
          },
          cohortes: {
            items: [
              {
                id: 4,
                nombre: "2026-A",
                programaAcademicoId: 3,
                activa: true,
              },
            ],
            total: 1,
          },
        }),
      );
    }
    if (path === "/api/academic/profile/me")
      return json(route, envelope(academicProfile));
    if (/^\/api\/academic\/profile\/\d+\/history$/.test(path))
      return json(route, envelope(pageResult([academicProfile])));
    if (path === "/api/academic/requests/pending")
      return json(route, envelope(pageResult([])));

    if (path === "/api/files" && method === "POST")
      return json(route, envelope(privateFile), 201);
    if (path === `/api/files/${privateFile.id}`) {
      state.filePolls += 1;
      return json(route, envelope({ ...privateFile, status: "DISPONIBLE" }));
    }
    if (path === "/api/documents" && method === "GET")
      return json(route, envelope(pageResult([documentRequirement])));
    if (path === "/api/documents/versions" && method === "POST") {
      return json(
        route,
        envelope({
          id: "document-version-1",
          version: 1,
          estado: "EN_REVISION",
          comentario: null,
          createdAt: now,
          updatedAt: now,
          archivo: { ...privateFile, status: "DISPONIBLE" },
        }),
        201,
      );
    }

    if (path === "/api/directory") return json(route, envelope(pageResult([])));
    if (path === "/api/directory/preferences")
      return json(
        route,
        envelope({ mostrarEmail: true, mostrarTelefono: false }),
      );

    if (path === "/api/kairos/projects" && method === "GET")
      return json(route, envelope(pageResult([project])));
    if (path === `/api/kairos/projects/${project.id}/kanban`) {
      return json(
        route,
        envelope({
          projectId: project.id,
          generatedAt: now,
          lanes: [
            {
              state: "PENDIENTE",
              total: 1,
              items: [{ ...activity, vencida: false, participantCount: 0 }],
            },
            { state: "EN_PROGRESO", total: 0, items: [] },
            { state: "BLOQUEADA", total: 0, items: [] },
            { state: "EN_REVISION", total: 0, items: [] },
            { state: "REQUIERE_CORRECCION", total: 0, items: [] },
            { state: "TERMINADA", total: 0, items: [] },
            { state: "CANCELADA", total: 0, items: [] },
          ],
        }),
      );
    }
    if (
      path === `/api/kairos/projects/${project.id}/activities` &&
      method === "POST"
    )
      return json(route, envelope(activity), 201);
    if (path === `/api/kairos/projects/${project.id}`)
      return json(route, envelope(project));

    if (path === "/api/reports/operational-metrics") {
      return json(
        route,
        envelope({
          from: "2026-08-27T00:00:00.000Z",
          to: now,
          attendance: [
            {
              status: "PRESENTE",
              _count: { _all: 8 },
              _sum: { durationSeconds: 14400 },
            },
          ],
          documents: [{ estado: "AUTORIZADO", _count: { _all: 4 } }],
          kairos: {
            byState: [{ state: "TERMINADA", _count: { _all: 3 } }],
            overdue: 1,
          },
          semantics: "Rango [from,to)",
        }),
      );
    }
    if (path === "/api/reports/export" && method === "POST") {
      if (options.reportExport === "async")
        return json(
          route,
          envelope({
            id: "export-1",
            type: "ATTENDANCE",
            status: "PENDIENTE",
            createdAt: now,
          }),
          202,
        );
      return route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: {
          "content-disposition": "attachment; filename=ares.csv",
        },
        body: "codigo,estado\nADMIN001,PRESENTE\n",
      });
    }
    if (path === "/api/reports/export/export-1/status") {
      state.reportPolls += 1;
      return json(
        route,
        envelope({
          id: "export-1",
          type: "ATTENDANCE",
          status: "COMPLETADO",
          totalFilas: 1,
          createdAt: now,
        }),
      );
    }
    if (path === "/api/reports/export/export-1/download")
      return json(route, envelope("https://downloads.ares.test/export-1.csv"));

    if (path.startsWith("/api/gamification/") && options.gamificationDisabled)
      return json(route, { error: "GAMIFICATION_DISABLED" }, 503);
    if (path === "/api/gamification/me")
      return json(
        route,
        envelope({
          usuarioId: 1,
          puntos: 120,
          nivel: 2,
          puntosNivelActual: 100,
          puntosSiguienteNivel: 200,
          progreso: 20,
          insignias: [],
        }),
      );
    if (path === "/api/gamification/me/history")
      return json(route, envelope(pageResult([])));
    if (path === "/api/gamification/admin/rules")
      return json(route, envelope([]));
    if (path === "/api/gamification/admin/badges")
      return json(route, envelope([]));

    if (path === "/api/library" && method === "GET")
      return json(route, envelope(pageResult([libraryDocument])));
    if (path === `/api/library/${libraryDocument.id}`)
      return json(route, envelope(libraryDocument));

    if (path === "/api/public-content/pages/servicio-social")
      return json(
        route,
        envelope({
          slug: "servicio-social",
          titulo: "Servicio social",
          estado: "PUBLICADO",
          metadata: {
            version: 1,
            resumenCambios: "Inicial",
            publishedAt: now,
          },
          bloques: publicPage.versiones[0].bloques,
        }),
      );
    if (path === "/api/public-content/faq")
      return json(
        route,
        envelope({
          slug: "preguntas-frecuentes",
          titulo: "Preguntas frecuentes",
          estado: "PUBLICADO",
          metadata: {
            version: 1,
            resumenCambios: "Inicial",
            publishedAt: now,
          },
          bloques: [
            {
              tipo: "FAQ",
              orden: 0,
              contenido: {
                pregunta: "¿Qué es ARES?",
                respuesta: "Una plataforma institucional.",
              },
            },
          ],
        }),
      );
    if (path === "/api/public-content/admin/pages" && method === "GET")
      return json(route, envelope(pageResult([publicPage])));
    if (path === `/api/public-content/admin/pages/${publicPage.id}`)
      return json(route, envelope(publicPage));

    if (path.startsWith("/api/printing-3d/") && options.printingDisabled)
      return json(route, { error: "PRINTING_3D_DISABLED" }, 503);
    if (path === "/api/printing-3d/jobs" && method === "GET")
      return json(route, envelope(pageResult([])));
    if (path === "/api/printing-3d/jobs" && method === "POST")
      return json(route, envelope(printingJob), 201);

    if (path === "/api/retention/requests/me" && method === "GET")
      return json(route, envelope([]));
    if (path === "/api/retention/requests/me" && method === "POST")
      return json(
        route,
        envelope({
          id: "request-1",
          motivo:
            body && typeof body === "object" && "motivo" in body
              ? body.motivo
              : "Solicitud",
          estado: "ABIERTA",
          clasificacion: [],
          createdAt: now,
        }),
        201,
      );
    if (path === "/api/retention/rules")
      return json(route, envelope(pageResult([])));
    if (path === "/api/retention/records")
      return json(route, envelope(pageResult([])));
    if (path === "/api/retention/legal-holds")
      return json(route, envelope(pageResult([])));
    if (path === "/api/retention/requests")
      return json(route, envelope(pageResult([])));
    if (path === "/api/retention/batches")
      return json(route, envelope(pageResult([])));
    if (path === "/api/retention/suppression-registry")
      return json(
        route,
        envelope(
          pageResult([
            {
              id: "ledger-1",
              categoria: "IDENTIDAD_CUENTA",
              resourceType: "Usuario",
              resourceFingerprint: "sha256:test",
              accion: "ANONIMIZAR",
              policyVersion: 1,
              loteId: "batch-1",
              occurredAt: now,
              lastReappliedAt: null,
            },
          ]),
        ),
      );
    if (
      path === "/api/retention/suppression-registry/reapply" &&
      method === "POST"
    )
      return json(route, envelope({ processed: 1 }));

    return json(route, { error: `E2E_UNMOCKED:${method}:${path}` }, 501);
  });

  return state;
}
