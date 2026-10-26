import { apiRequest } from "@/lib/api";
import {
  actionIdempotencyKey,
  clearActionIdempotencyKey,
} from "@/lib/backend2/idempotency";
import type { ApiEnvelope, UserRole } from "@/lib/types";

export type DirectoryScope = "area" | "project" | "all";

export type DirectoryEntry = {
  id: number;
  codigo: string;
  email?: string;
  rol: UserRole;
  sede: { id: number; nombre: string } | null;
  area: { id: number; nombre: string } | null;
  turno: { id: number; nombre: string } | null;
};

export type DirectoryPage = {
  items: DirectoryEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type DirectoryPreferences = {
  visibleEnArea: boolean;
  visibleEnProyectos: boolean;
  mostrarEmail: boolean;
};

export function directoryQuery(input: {
  scope: DirectoryScope;
  projectId?: string;
  q?: string;
  page?: number;
}) {
  if (input.scope === "project" && !input.projectId?.trim()) {
    throw new Error("PROJECT_ID_REQUIRED");
  }
  const params = new URLSearchParams({
    scope: input.scope,
    page: String(input.page ?? 1),
    pageSize: "20",
  });
  if (input.scope === "project")
    params.set("projectId", input.projectId!.trim());
  if (input.q?.trim()) params.set("q", input.q.trim());
  return params.toString();
}

export async function getDirectory(input: {
  scope: DirectoryScope;
  projectId?: string;
  q?: string;
  page?: number;
}) {
  return (
    await apiRequest<ApiEnvelope<DirectoryPage>>(
      `/api/directory?${directoryQuery(input)}`,
    )
  ).data;
}

export async function getDirectoryPreferences() {
  return (
    await apiRequest<ApiEnvelope<DirectoryPreferences>>(
      "/api/directory/preferences/me",
    )
  ).data;
}

export async function updateDirectoryPreferences(
  userId: number,
  input: Partial<DirectoryPreferences>,
) {
  const action = "directory-preferences";
  const key = actionIdempotencyKey({
    userId,
    action,
    target: "self",
    payload: input,
  });
  const data = (
    await apiRequest<ApiEnvelope<DirectoryPreferences>>(
      "/api/directory/preferences/me",
      {
        method: "PATCH",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(input),
      },
    )
  ).data;
  clearActionIdempotencyKey({ userId, action, target: "self" });
  return data;
}
