import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiRequest: vi.fn() };
});

import { ApiError, apiRequest } from "@/lib/api";
import { libraryApi } from "@/lib/backend2/library";
import {
  printing3dApi,
  isPrinting3dDisabled,
} from "@/lib/backend2/printing-3d";
import {
  publicContentApi,
  type PublicPageVersionInput,
} from "@/lib/backend2/public-content";
import {
  canAuthorizeRule,
  retentionApi,
  retentionCategories,
} from "@/lib/backend2/retention";

const requestMock = vi.mocked(apiRequest);

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Backend 2 domain C contracts", () => {
  it("keeps library workflow endpoints separate and returns the signed URL string", async () => {
    requestMock
      .mockResolvedValueOnce({
        data: { id: "version-1", estado: "EN_REVISION" },
      })
      .mockResolvedValueOnce({ data: "https://storage.example/signed" });
    await libraryApi.submitReview("version-1");
    await expect(libraryApi.download("version-1")).resolves.toBe(
      "https://storage.example/signed",
    );
    expect(requestMock.mock.calls[0][0]).toBe(
      "/api/library/versions/version-1/submit-review",
    );
    expect(requestMock.mock.calls[1][0]).toBe(
      "/api/library/versions/version-1/download",
    );
  });

  it("sends idempotency for explicit library acknowledgement", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", storage());
    requestMock.mockResolvedValue({ data: { id: "ack-1" } });
    await libraryApi.acknowledge(7, "version-1");
    const options = requestMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(options.headers).get("Idempotency-Key")).toBeTruthy();
    expect(options.method).toBe("POST");
  });

  it("serializes every approved public block type without HTML", async () => {
    const input: PublicPageVersionInput = {
      titulo: "Servicio social",
      resumenCambios: "Versión inicial",
      bloques: [
        { tipo: "TEXTO", orden: 0, contenido: { texto: "Texto seguro" } },
        {
          tipo: "ENCABEZADO",
          orden: 1,
          contenido: { texto: "Título", nivel: 2 },
        },
        {
          tipo: "LISTA",
          orden: 2,
          contenido: { elementos: ["Uno"], ordenada: false },
        },
        {
          tipo: "ENLACE",
          orden: 3,
          contenido: { etiqueta: "Ir", url: "/", nuevaVentana: false },
        },
        {
          tipo: "AVISO",
          orden: 4,
          contenido: { texto: "Aviso", tono: "INFORMATIVO" },
        },
        {
          tipo: "IMAGEN",
          orden: 5,
          activoPublicoId: "c12345678901234567890",
          contenido: { alt: "Descripción" },
        },
        {
          tipo: "FAQ",
          orden: 6,
          contenido: { pregunta: "¿Qué?", respuesta: "Esto" },
        },
      ],
    };
    requestMock.mockResolvedValue({ data: { id: "page-1" } });
    await publicContentApi.createPage({ slug: "servicio-social", ...input });
    const options = requestMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(options.body)) as typeof input;
    expect(body.bloques.map((block) => block.tipo)).toEqual([
      "TEXTO",
      "ENCABEZADO",
      "LISTA",
      "ENLACE",
      "AVISO",
      "IMAGEN",
      "FAQ",
    ]);
    expect(String(options.body)).not.toContain("<script");
  });

  it("recognizes the 3D feature flag error and uses a signed string download", async () => {
    expect(
      isPrinting3dDisabled(new ApiError(503, "PRINTING_3D_DISABLED")),
    ).toBe(true);
    requestMock.mockResolvedValue({ data: "https://storage.example/model" });
    await expect(printing3dApi.download("job-1")).resolves.toBe(
      "https://storage.example/model",
    );
  });

  it("adds an idempotency key to 3D state transitions", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", storage());
    requestMock.mockResolvedValue({ data: { id: "job-1" } });
    await printing3dApi.review(9, "job-1", {
      decision: "REJECT",
      motivo: "STL inválido",
    });
    const options = requestMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(options.headers).get("Idempotency-Key")).toBeTruthy();
    expect(JSON.parse(String(options.body))).toEqual({
      decision: "REJECT",
      motivo: "STL inválido",
    });
  });

  it("keeps all thirteen retention categories and blocks unapproved destructive rules", () => {
    expect(retentionCategories).toHaveLength(13);
    expect(
      canAuthorizeRule({ provisional: false, accionFinal: "ELIMINAR" }, false),
    ).toBe(false);
    expect(
      canAuthorizeRule({ provisional: true, accionFinal: "ANONIMIZAR" }, false),
    ).toBe(true);
  });

  it("separates suppression request, batch authorization and execution", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", storage());
    requestMock.mockResolvedValue({ data: { id: "result" } });
    await retentionApi.requestSuppression(
      4,
      "Quiero revisar y cancelar mi cuenta",
    );
    await retentionApi.authorizeBatch(4, "batch-1");
    await retentionApi.executeBatch(4, "batch-1");
    expect(requestMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/retention/requests/me",
      "/api/retention/batches/batch-1/authorize",
      "/api/retention/batches/batch-1/execute",
    ]);
    for (const [, options] of requestMock.mock.calls) {
      expect(
        new Headers((options as RequestInit).headers).get("Idempotency-Key"),
      ).toBeTruthy();
    }
  });
});
