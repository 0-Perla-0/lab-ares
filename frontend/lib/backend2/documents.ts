import { apiRequest } from "@/lib/api";
import type { ApiEnvelope } from "@/lib/types";

export type DocumentState =
  | "PENDIENTE_CARGA"
  | "EN_REVISION"
  | "AUTORIZADO"
  | "RECHAZADO"
  | "REQUIERE_CORRECCION";

export type DocumentFile = {
  id: string;
  originalName: string;
  detectedMime: string | null;
  sizeBytes: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentVersion = {
  id: string;
  version: number;
  estado: DocumentState;
  comentario: string | null;
  createdAt: string;
  updatedAt: string;
  archivo: DocumentFile;
};

export type DocumentRequirement = {
  id: number;
  usuarioId: number;
  codigo: string;
  nombre: string;
  obligatorio: boolean;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  versiones: DocumentVersion[];
};

export type DocumentsPage = {
  items: DocumentRequirement[];
  total: number;
  page: number;
  pageSize: number;
};

export function normalizeRequirements(page: DocumentsPage) {
  return {
    ...page,
    items: page.items.map((item) => ({
      ...item,
      versiones: [...(item.versiones ?? [])].sort(
        (a, b) => b.version - a.version,
      ),
    })),
  };
}

export async function getDocuments(userId?: number, page = 1) {
  const params = new URLSearchParams({ page: String(page), pageSize: "50" });
  if (userId) params.set("userId", String(userId));
  const response = await apiRequest<ApiEnvelope<DocumentsPage>>(
    `/api/documents?${params.toString()}`,
  );
  return normalizeRequirements(response.data);
}

export async function createDocumentRequirement(input: {
  usuarioId: number;
  codigo: string;
  nombre: string;
  obligatorio: boolean;
}) {
  return (
    await apiRequest<ApiEnvelope<DocumentRequirement>>(
      "/api/documents/requirements",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    )
  ).data;
}

export async function attachDocumentVersion(
  requisitoId: number,
  archivoId: string,
) {
  return (
    await apiRequest<ApiEnvelope<DocumentVersion>>("/api/documents/versions", {
      method: "POST",
      body: JSON.stringify({ requisitoId, archivoId }),
    })
  ).data;
}

export async function reviewDocumentVersion(
  versionId: string,
  estado: Exclude<DocumentState, "PENDIENTE_CARGA" | "EN_REVISION">,
  comentario?: string,
) {
  return (
    await apiRequest<ApiEnvelope<DocumentVersion>>(
      `/api/documents/versions/${encodeURIComponent(versionId)}/review`,
      {
        method: "POST",
        body: JSON.stringify({
          estado,
          ...(comentario?.trim() ? { comentario: comentario.trim() } : {}),
        }),
      },
    )
  ).data;
}

export async function getDocumentDownload(versionId: string) {
  return (
    await apiRequest<ApiEnvelope<string>>(
      `/api/documents/versions/${encodeURIComponent(versionId)}/download`,
    )
  ).data;
}
