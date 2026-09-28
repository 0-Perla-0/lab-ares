import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiRequest: vi.fn() };
});

import { apiRequest } from "@/lib/api";
import {
  academicHistoryPath,
  requestAcademicProfile,
  resolveAcademicRequest,
} from "@/lib/backend2/academic";
import {
  attachDocumentVersion,
  normalizeRequirements,
  reviewDocumentVersion,
} from "@/lib/backend2/documents";
import {
  directoryQuery,
  updateDirectoryPreferences,
} from "@/lib/backend2/directory";
import {
  getOperationalMetrics,
  reportRangeQuery,
  requestReportExport,
} from "@/lib/backend2/reports";
import { backend2NavigationGroups } from "@/lib/backend2/navigation";

const requestMock = vi.mocked(apiRequest);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Backend 2 domain A API adapters", () => {
  it("links academic and document navigation to existing App Router pages", () => {
    const items = backend2NavigationGroups.flatMap((group) => group.items);
    expect(items.find((item) => item.icon === "academic")?.href).toBe(
      "/portal/perfil-academico",
    );
    expect(items.find((item) => item.icon === "documents")?.href).toBe(
      "/portal/expediente",
    );
  });

  it("uses the authenticated user id route for academic history", () => {
    expect(academicHistoryPath(42, 3)).toBe(
      "/api/academic/profile/42/history?page=3&pageSize=20",
    );
    expect(() => academicHistoryPath(0)).toThrow("INVALID_USER_ID");
  });

  it("sends a complete academic request and a rejection reason", async () => {
    requestMock.mockResolvedValue({ data: { id: 9 } });
    await requestAcademicProfile({
      institucionId: 1,
      unidadAcademicaId: null,
      programaAcademicoId: 2,
      cohorteId: null,
      inicio: "2026-09-01",
      fin: null,
    });
    expect(requestMock).toHaveBeenCalledWith(
      "/api/academic/profile/me",
      expect.objectContaining({ method: "PUT" }),
    );
    await resolveAcademicRequest(9, false, "No coincide");
    expect(requestMock).toHaveBeenLastCalledWith(
      "/api/academic/profile/requests/9/confirm",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ accept: false, motivo: "No coincide" }),
      }),
    );
  });

  it("normalizes document versions newest-first and keeps upload/review separate", async () => {
    const page = normalizeRequirements({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 1,
          usuarioId: 7,
          codigo: "ID",
          nombre: "Identificación",
          obligatorio: true,
          activo: true,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
          versiones: [
            {
              id: "a",
              version: 1,
              estado: "RECHAZADO",
              comentario: "x",
              createdAt: "",
              updatedAt: "",
              archivo: {} as never,
            },
            {
              id: "b",
              version: 2,
              estado: "EN_REVISION",
              comentario: null,
              createdAt: "",
              updatedAt: "",
              archivo: {} as never,
            },
          ],
        },
      ],
    });
    expect(page.items[0].versiones.map((version) => version.version)).toEqual([
      2, 1,
    ]);
    requestMock.mockResolvedValue({ data: {} });
    await attachDocumentVersion(1, "a".repeat(30));
    await reviewDocumentVersion(
      "version-1",
      "REQUIERE_CORRECCION",
      "Falta página",
    );
    expect(requestMock.mock.calls[0][0]).toBe("/api/documents/versions");
    expect(requestMock.mock.calls[1][0]).toBe(
      "/api/documents/versions/version-1/review",
    );
  });

  it("validates project scope and serializes privacy preferences", async () => {
    expect(() => directoryQuery({ scope: "project" })).toThrow(
      "PROJECT_ID_REQUIRED",
    );
    expect(
      directoryQuery({
        scope: "project",
        projectId: " project-1 ",
        q: "  A-01 ",
      }),
    ).toContain("projectId=project-1");
    requestMock.mockResolvedValue({
      data: {
        visibleEnArea: true,
        visibleEnProyectos: false,
        mostrarEmail: false,
      },
    });
    await updateDirectoryPreferences({ mostrarEmail: false });
    expect(requestMock).toHaveBeenCalledWith("/api/directory/preferences/me", {
      method: "PATCH",
      body: JSON.stringify({ mostrarEmail: false }),
    });
  });

  it("uses an exclusive report end date and accepts metric envelopes", async () => {
    const params = new URLSearchParams(
      reportRangeQuery("2026-09-01", "2026-09-10"),
    );
    expect(params.get("from")).toContain("2026-09-01");
    expect(params.get("to")).toContain("2026-09-11");
    const payload = {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-11T00:00:00.000Z",
      attendance: [],
      documents: [],
      kairos: { byState: [], overdue: 0 },
      semantics: "exclusive",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: payload }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      getOperationalMetrics("2026-09-01", "2026-09-10"),
    ).resolves.toEqual(payload);
  });

  it("distinguishes synchronous CSV and asynchronous export jobs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("a,b\r\n1,2", {
          status: 200,
          headers: {
            "content-disposition": 'attachment; filename="asistencia.csv"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { id: "job-1", type: "DOCUMENTS", status: "PENDIENTE" },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const sync = await requestReportExport("ATTENDANCE");
    expect(sync.kind).toBe("download");
    if (sync.kind === "download") expect(sync.filename).toBe("asistencia.csv");
    const asyncJob = await requestReportExport("DOCUMENTS");
    expect(asyncJob).toEqual({
      kind: "job",
      job: expect.objectContaining({ id: "job-1", status: "PENDIENTE" }),
    });
  });
});
