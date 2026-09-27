import { apiRequest } from "@/lib/api";
import {
  actionIdempotencyKey,
  clearActionIdempotencyKey,
} from "@/lib/backend2/idempotency";
import type { ApiEnvelope } from "@/lib/types";

export const libraryCategories = [
  "MANUAL",
  "PROCEDIMIENTO",
  "REGLAMENTO",
  "FORMATO",
  "INSTRUCTIVO",
  "PROTOCOLO",
  "CAPACITACION",
  "PLANTILLA",
  "COMUNICADO_PERMANENTE",
  "POLITICA",
] as const;
export const libraryScopes = ["GLOBAL", "SEDE", "AREA", "PROYECTO"] as const;
export const libraryStates = [
  "BORRADOR",
  "EN_REVISION",
  "PUBLICADO",
  "ARCHIVADO",
] as const;

export type LibraryCategory = (typeof libraryCategories)[number];
export type LibraryScope = (typeof libraryScopes)[number];
export type LibraryState = (typeof libraryStates)[number];
export type LibraryVersion = {
  id: string;
  numero: number;
  estado: LibraryState;
  resumenCambios: string;
  retroalimentacion?: string | null;
  motivoSustitucion?: string | null;
  vigenteDesde?: string | null;
  vigenteHasta?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  publishedAt?: string | null;
  archivedAt?: string | null;
  createdAt?: string;
  autorId?: number;
  revisadoPorId?: number | null;
};
export type LibraryDocument = {
  id: string;
  titulo: string;
  descripcion?: string | null;
  categoria: LibraryCategory;
  alcance: LibraryScope;
  estado: LibraryState;
  requiereAcuse: boolean;
  sedeId?: number | null;
  areaId?: number | null;
  proyectoId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  versiones: LibraryVersion[];
};
export type LibraryPage = {
  items: LibraryDocument[];
  total: number;
  page: number;
  pageSize: number;
};
export type LibraryVersionInput = {
  archivoId: string;
  resumenCambios: string;
  vigenteDesde?: string;
  vigenteHasta?: string;
};
export type LibraryCreateInput = LibraryVersionInput & {
  titulo: string;
  descripcion?: string;
  categoria: LibraryCategory;
  alcance: LibraryScope;
  sedeId?: number;
  areaId?: number;
  proyectoId?: string;
  requiereAcuse?: boolean;
};
export type DownloadGrant = string;

function json(
  method: string,
  body?: unknown,
  headers?: HeadersInit,
): RequestInit {
  return {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function query(input: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

async function idempotent<T>(
  userId: number,
  action: string,
  target: string,
  path: string,
  body?: unknown,
) {
  const key = actionIdempotencyKey({ userId, action, target, payload: body });
  const response = await apiRequest<ApiEnvelope<T>>(
    path,
    json("POST", body, { "Idempotency-Key": key }),
  );
  clearActionIdempotencyKey({ userId, action, target });
  return response.data;
}

export const libraryApi = {
  list(
    filters: {
      page?: number;
      pageSize?: number;
      q?: string;
      categoria?: LibraryCategory | "";
      alcance?: LibraryScope | "";
      estado?: LibraryState | "";
      requiereAcuse?: boolean;
    } = {},
  ) {
    return apiRequest<ApiEnvelope<LibraryPage>>(
      `/api/library${query({ page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, q: filters.q?.trim(), categoria: filters.categoria, alcance: filters.alcance, estado: filters.estado, requiereAcuse: filters.requiereAcuse })}`,
    ).then((result) => result.data);
  },
  detail(id: string) {
    return apiRequest<ApiEnvelope<LibraryDocument>>(
      `/api/library/${encodeURIComponent(id)}`,
    ).then((result) => result.data);
  },
  create(input: LibraryCreateInput) {
    return apiRequest<ApiEnvelope<LibraryDocument>>(
      "/api/library",
      json("POST", input),
    ).then((result) => result.data);
  },
  createVersion(documentId: string, input: LibraryVersionInput) {
    return apiRequest<ApiEnvelope<LibraryVersion>>(
      `/api/library/${encodeURIComponent(documentId)}/versions`,
      json("POST", input),
    ).then((result) => result.data);
  },
  submitReview(versionId: string) {
    return apiRequest<ApiEnvelope<LibraryVersion>>(
      `/api/library/versions/${encodeURIComponent(versionId)}/submit-review`,
      json("POST"),
    ).then((result) => result.data);
  },
  review(
    versionId: string,
    input: {
      decision: "APPROVE" | "REQUEST_CHANGES";
      retroalimentacion?: string;
    },
  ) {
    return apiRequest<ApiEnvelope<LibraryVersion>>(
      `/api/library/versions/${encodeURIComponent(versionId)}/review`,
      json("POST", input),
    ).then((result) => result.data);
  },
  publish(versionId: string, motivoSustitucion?: string) {
    return apiRequest<ApiEnvelope<LibraryVersion>>(
      `/api/library/versions/${encodeURIComponent(versionId)}/publish`,
      json("POST", motivoSustitucion ? { motivoSustitucion } : {}),
    ).then((result) => result.data);
  },
  archive(documentId: string, motivo: string) {
    return apiRequest<ApiEnvelope<LibraryDocument>>(
      `/api/library/${encodeURIComponent(documentId)}/archive`,
      json("POST", { motivo }),
    ).then((result) => result.data);
  },
  download(versionId: string) {
    return apiRequest<ApiEnvelope<DownloadGrant>>(
      `/api/library/versions/${encodeURIComponent(versionId)}/download`,
    ).then((result) => result.data);
  },
  acknowledge(userId: number, versionId: string) {
    return idempotent<unknown>(
      userId,
      "library-acknowledge",
      versionId,
      `/api/library/versions/${encodeURIComponent(versionId)}/acknowledge`,
    );
  },
};
