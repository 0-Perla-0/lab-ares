import { ApiError, apiRequest } from "@/lib/api";
import {
  actionIdempotencyKey,
  clearActionIdempotencyKey,
} from "@/lib/backend2/idempotency";
import type { ApiEnvelope } from "@/lib/types";

export type GamificationBadge = {
  codigo: string;
  nombre: string;
  descripcion: string;
  umbralPuntos: number;
  version: number;
  motivo?: string;
  createdAt?: string;
};
export type GamificationProfile = {
  usuario: { id: number; codigo: string };
  puntos: number;
  nivel: number;
  puntosPorNivel: number;
  eventos: number;
  insignias: GamificationBadge[];
  privado: true;
};
export type GamificationEvent = {
  id: string;
  usuarioId?: number;
  puntos: number;
  tipo: string;
  motivo: string;
  actividadId: string | null;
  regla: { codigo: string; version: number } | null;
  reversaDeId: string | null;
  createdAt: string;
};
export type GamificationHistory = {
  items: GamificationEvent[];
  total: number;
  page: number;
  pageSize: number;
};
export type GamificationRule = {
  id: string;
  codigo: string;
  version: number;
  origen: "KAIROS_TERMINADA";
  puntos: number;
  motivo: string;
  activa?: boolean;
  createdAt?: string;
};

const json = (
  method: string,
  body: unknown,
  headers?: HeadersInit,
): RequestInit => ({ method, headers, body: JSON.stringify(body) });
const page = (pageNumber = 1) => `?page=${pageNumber}&pageSize=50`;

export function isGamificationDisabled(error: unknown) {
  return error instanceof ApiError && error.code === "GAMIFICATION_DISABLED";
}

export const gamificationApi = {
  profile(userId?: number) {
    const path = userId
      ? `/api/gamification/admin/users/${userId}`
      : "/api/gamification/me";
    return apiRequest<ApiEnvelope<GamificationProfile>>(path).then(
      (x) => x.data,
    );
  },
  history(userId?: number, pageNumber = 1) {
    const path = userId
      ? `/api/gamification/admin/users/${userId}/history`
      : "/api/gamification/me/history";
    return apiRequest<ApiEnvelope<GamificationHistory>>(
      `${path}${page(pageNumber)}`,
    ).then((x) => x.data);
  },
  rules() {
    return apiRequest<ApiEnvelope<GamificationRule[]>>(
      "/api/gamification/admin/rules",
    ).then((x) => x.data);
  },
  badges() {
    return apiRequest<ApiEnvelope<GamificationBadge[]>>(
      "/api/gamification/admin/badges",
    ).then((x) => x.data);
  },
  createRule(body: {
    codigo: string;
    origen: "KAIROS_TERMINADA";
    puntos: number;
    motivo: string;
  }) {
    return apiRequest<ApiEnvelope<GamificationRule>>(
      "/api/gamification/admin/rules",
      json("POST", body),
    ).then((x) => x.data);
  },
  createBadge(body: {
    codigo: string;
    nombre: string;
    descripcion: string;
    umbralPuntos: number;
    motivo: string;
  }) {
    return apiRequest<ApiEnvelope<GamificationBadge>>(
      "/api/gamification/admin/badges",
      json("POST", body),
    ).then((x) => x.data);
  },
  async recognize(
    actorId: number,
    body: { usuarioId: number; puntos: number; motivo: string },
  ) {
    const action = "gamification-recognition";
    const key = actionIdempotencyKey({
      userId: actorId,
      action,
      target: String(body.usuarioId),
      payload: body,
    });
    const data = await apiRequest<ApiEnvelope<GamificationEvent>>(
      "/api/gamification/admin/recognitions",
      json("POST", body, { "Idempotency-Key": key }),
    ).then((x) => x.data);
    clearActionIdempotencyKey({
      userId: actorId,
      action,
      target: String(body.usuarioId),
    });
    return data;
  },
  async reverse(actorId: number, eventId: string, motivo: string) {
    const action = "gamification-reverse";
    const body = { motivo };
    const key = actionIdempotencyKey({
      userId: actorId,
      action,
      target: eventId,
      payload: body,
    });
    const data = await apiRequest<ApiEnvelope<GamificationEvent>>(
      `/api/gamification/admin/events/${encodeURIComponent(eventId)}/reverse`,
      json("POST", body, { "Idempotency-Key": key }),
    ).then((x) => x.data);
    clearActionIdempotencyKey({ userId: actorId, action, target: eventId });
    return data;
  },
};
