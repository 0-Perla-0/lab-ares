import { apiRequest } from "@/lib/api";
import type { ApiEnvelope } from "@/lib/types";

export type AcademicCatalogKind =
  "institucion" | "unidad" | "programa" | "cohorte";

export type AcademicCatalogItem = {
  id: number;
  nombre: string;
  activa?: boolean;
  institucionId?: number;
  unidadAcademicaId?: number;
  programaAcademicoId?: number;
};

export type AcademicCatalogs = {
  page: number;
  pageSize: number;
  instituciones: { items: AcademicCatalogItem[]; total: number };
  unidades: { items: AcademicCatalogItem[]; total: number };
  programas: { items: AcademicCatalogItem[]; total: number };
  cohortes: { items: AcademicCatalogItem[]; total: number };
};

export type AcademicProfile = {
  id: number;
  usuarioId: number;
  institucionId: number;
  unidadAcademicaId: number | null;
  programaAcademicoId: number;
  cohorteId: number | null;
  inicio: string;
  fin: string | null;
  vigente: boolean;
  estado: string;
  motivo?: string | null;
  createdAt?: string;
  updatedAt?: string;
  institucion?: AcademicCatalogItem;
  unidadAcademica?: AcademicCatalogItem | null;
  programaAcademico?: AcademicCatalogItem;
  cohorte?: AcademicCatalogItem | null;
};

export type AcademicProfileInput = Pick<
  AcademicProfile,
  | "institucionId"
  | "unidadAcademicaId"
  | "programaAcademicoId"
  | "cohorteId"
  | "inicio"
  | "fin"
>;

export type AcademicPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function academicHistoryPath(userId: number, page = 1) {
  if (!Number.isInteger(userId) || userId <= 0)
    throw new Error("INVALID_USER_ID");
  return `/api/academic/profile/${userId}/history?page=${page}&pageSize=20`;
}

export async function getAcademicCatalogs(search = "") {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  if (search.trim()) params.set("search", search.trim());
  return (
    await apiRequest<ApiEnvelope<AcademicCatalogs>>(
      `/api/academic/catalogs?${params.toString()}`,
    )
  ).data;
}

export async function getMyAcademicProfile() {
  return (
    await apiRequest<ApiEnvelope<AcademicProfile | null>>(
      "/api/academic/profile/me",
    )
  ).data;
}

export async function requestAcademicProfile(input: AcademicProfileInput) {
  return (
    await apiRequest<ApiEnvelope<AcademicProfile>>("/api/academic/profile/me", {
      method: "PUT",
      body: JSON.stringify(input),
    })
  ).data;
}

export async function getAcademicHistory(userId: number, page = 1) {
  return (
    await apiRequest<ApiEnvelope<AcademicPage<AcademicProfile>>>(
      academicHistoryPath(userId, page),
    )
  ).data;
}

export async function getPendingAcademicRequests(page = 1) {
  return (
    await apiRequest<ApiEnvelope<AcademicPage<AcademicProfile>>>(
      `/api/academic/requests/pending?page=${page}&pageSize=20`,
    )
  ).data;
}

export async function resolveAcademicRequest(
  requestId: number,
  accept: boolean,
  motivo?: string,
) {
  return (
    await apiRequest<ApiEnvelope<AcademicProfile>>(
      `/api/academic/profile/requests/${requestId}/confirm`,
      {
        method: "POST",
        body: JSON.stringify({
          accept,
          ...(motivo?.trim() ? { motivo: motivo.trim() } : {}),
        }),
      },
    )
  ).data;
}

export async function createAcademicCatalog(
  kind: AcademicCatalogKind,
  input: { nombre: string; parentId?: number | null },
) {
  return (
    await apiRequest<ApiEnvelope<AcademicCatalogItem>>(
      `/api/academic/catalogs/${kind}`,
      { method: "POST", body: JSON.stringify(input) },
    )
  ).data;
}
