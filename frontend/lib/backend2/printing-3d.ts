import { ApiError, apiRequest } from "@/lib/api";
import {
  actionIdempotencyKey,
  clearActionIdempotencyKey,
} from "@/lib/backend2/idempotency";
import type { ApiEnvelope } from "@/lib/types";

export const printingStates = [
  "SOLICITADO",
  "EN_REVISION",
  "APROBADO",
  "EN_COLA",
  "EN_IMPRESION",
  "COMPLETADO",
  "RECHAZADO",
  "CANCELADO",
  "FALLIDO",
] as const;
export type PrintingState = (typeof printingStates)[number];
export type PrintingExecution = {
  id: string;
  numero: number;
  startedAt: string;
  finishedAt?: string | null;
  material: string;
  pesoGramos?: number | null;
  resultado?: "COMPLETADA" | "FALLIDA" | null;
  observacion?: string | null;
  operador: { id: number; codigo: string };
};
export type PrintingJob = {
  id: string;
  descripcion: string;
  estado: PrintingState;
  motivoRevision?: string | null;
  motivoCancelacion?: string | null;
  solicitante: { id: number; codigo: string };
  operadorAsignado?: { id: number; codigo: string } | null;
  revisadoPor?: { id: number; codigo: string } | null;
  archivo: {
    id: string;
    originalName: string;
    detectedMime: string;
    status: string;
  };
  ejecuciones: PrintingExecution[];
  createdAt?: string;
  updatedAt?: string;
};
export type PrintingPage = {
  items: PrintingJob[];
  total: number;
  page: number;
  pageSize: number;
};

export function isPrinting3dDisabled(error: unknown) {
  return error instanceof ApiError && error.code === "PRINTING_3D_DISABLED";
}

async function mutate<T>(
  userId: number,
  action: string,
  target: string,
  path: string,
  payload?: unknown,
) {
  const key = actionIdempotencyKey({ userId, action, target, payload });
  const response = await apiRequest<ApiEnvelope<T>>(path, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  clearActionIdempotencyKey({ userId, action, target });
  return response.data;
}

export const printing3dApi = {
  list(page = 1, estado = "") {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (estado) params.set("estado", estado);
    return apiRequest<ApiEnvelope<PrintingPage>>(
      `/api/printing-3d/jobs?${params}`,
    ).then((result) => result.data);
  },
  detail(id: string) {
    return apiRequest<ApiEnvelope<PrintingJob>>(
      `/api/printing-3d/jobs/${encodeURIComponent(id)}`,
    ).then((result) => result.data);
  },
  create(userId: number, input: { archivoId: string; descripcion: string }) {
    return mutate<PrintingJob>(
      userId,
      "printing-create",
      "new",
      "/api/printing-3d/jobs",
      input,
    );
  },
  review(
    userId: number,
    id: string,
    input: { decision: "START" | "APPROVE" | "REJECT"; motivo?: string },
  ) {
    return mutate<PrintingJob>(
      userId,
      "printing-review",
      id,
      `/api/printing-3d/jobs/${encodeURIComponent(id)}/review`,
      input,
    );
  },
  assign(userId: number, id: string, operadorId: number) {
    return mutate<PrintingJob>(
      userId,
      "printing-assign",
      id,
      `/api/printing-3d/jobs/${encodeURIComponent(id)}/assign`,
      { operadorId },
    );
  },
  start(userId: number, id: string, material: string) {
    return mutate<PrintingJob>(
      userId,
      "printing-start",
      id,
      `/api/printing-3d/jobs/${encodeURIComponent(id)}/executions`,
      { material },
    );
  },
  finish(
    userId: number,
    id: string,
    executionId: string,
    input: {
      resultado: "COMPLETADA" | "FALLIDA";
      pesoGramos?: number;
      observacion?: string;
    },
  ) {
    return mutate<PrintingJob>(
      userId,
      "printing-finish",
      executionId,
      `/api/printing-3d/jobs/${encodeURIComponent(id)}/executions/${encodeURIComponent(executionId)}/finish`,
      input,
    );
  },
  retry(userId: number, id: string, motivo: string) {
    return mutate<PrintingJob>(
      userId,
      "printing-retry",
      id,
      `/api/printing-3d/jobs/${encodeURIComponent(id)}/retry`,
      { motivo },
    );
  },
  cancel(userId: number, id: string, motivo: string) {
    return mutate<PrintingJob>(
      userId,
      "printing-cancel",
      id,
      `/api/printing-3d/jobs/${encodeURIComponent(id)}/cancel`,
      { motivo },
    );
  },
  download(id: string) {
    return apiRequest<ApiEnvelope<string>>(
      `/api/printing-3d/jobs/${encodeURIComponent(id)}/download`,
    ).then((result) => result.data);
  },
};
