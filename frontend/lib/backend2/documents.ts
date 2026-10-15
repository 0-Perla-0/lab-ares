import { apiRequest } from "@/lib/api";
import type { ApiEnvelope } from "@/lib/types";
import { criticalMutation } from "@/lib/service-social";

export type DocumentState =
  | "PENDIENTE_CARGA"
  | "EN_REVISION"
  | "AUTORIZADO"
  | "RECHAZADO"
  | "REQUIERE_CORRECCION"
  | "VENCIDO"
  | "CANCELADO";
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export type Formalization = {
  id: string;
  usuarioId: number;
  inicio: string;
  createdAt: string;
  formalizadoPorId: number;
  academicSnapshot: { institucion: string; programa: string };
};
export async function getFormalizations(userId: number) {
  return (
    await apiRequest<ApiEnvelope<Formalization[]>>(
      `/api/documents/formalizations?userId=${userId}`,
    )
  ).data;
}
export function formalizeExpedient(usuarioId: number, inicio: string) {
  return criticalMutation<Formalization>("/api/documents/formalizations", {
    usuarioId,
    inicio,
  });
}

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
  return criticalMutation<DocumentRequirement>(
    "/api/documents/requirements",
    input,
  );
}

export async function attachDocumentVersion(
  requisitoId: number,
  archivoId: string,
) {
  return criticalMutation<DocumentVersion>("/api/documents/versions", {
    requisitoId,
    archivoId,
  });
}

export async function reviewDocumentVersion(
  versionId: string,
  estado: "AUTORIZADO" | "RECHAZADO" | "REQUIERE_CORRECCION",
  comentario?: string,
) {
  return criticalMutation<DocumentVersion>(
    `/api/documents/versions/${encodeURIComponent(versionId)}/review`,
    {
      estado,
      ...(comentario?.trim() ? { comentario: comentario.trim() } : {}),
    },
  );
}

export async function getDocumentDownload(versionId: string) {
  return (
    await apiRequest<ApiEnvelope<string>>(
      `/api/documents/versions/${encodeURIComponent(versionId)}/download`,
    )
  ).data;
}
