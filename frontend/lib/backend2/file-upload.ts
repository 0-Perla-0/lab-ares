import { apiRequest } from "@/lib/api";
import type { ApiEnvelope } from "@/lib/types";

export type BackendFileStatus =
  | "RECIBIDO"
  | "PENDIENTE_ANALISIS"
  | "ANALIZANDO"
  | "DISPONIBLE"
  | "RECHAZADO"
  | "ERROR_ANALISIS"
  | "ELIMINADO";

export type FileScanStage =
  "PENDIENTE" | "EN_ANALISIS" | "DISPONIBLE" | "RECHAZADO";

export type PrivateFile = {
  id: string;
  status: BackendFileStatus;
  originalName: string;
  detectedMime: string | null;
  sizeBytes: number;
  createdAt: string;
  updatedAt?: string;
};

export type FileUploadProgress = {
  phase: "uploading" | "scanning" | "ready" | "rejected";
  stage: FileScanStage;
  label: string;
  fileId: string | null;
};

const terminalStatuses = new Set<BackendFileStatus>([
  "DISPONIBLE",
  "RECHAZADO",
  "ERROR_ANALISIS",
  "ELIMINADO",
]);

export function fileScanPresentation(
  status: BackendFileStatus,
): Omit<FileUploadProgress, "fileId"> {
  if (status === "DISPONIBLE") {
    return { phase: "ready", stage: "DISPONIBLE", label: "Archivo disponible" };
  }
  if (["RECHAZADO", "ERROR_ANALISIS", "ELIMINADO"].includes(status)) {
    return {
      phase: "rejected",
      stage: "RECHAZADO",
      label:
        status === "ERROR_ANALISIS"
          ? "No se pudo analizar el archivo"
          : "Archivo rechazado",
    };
  }
  if (status === "ANALIZANDO") {
    return {
      phase: "scanning",
      stage: "EN_ANALISIS",
      label: "Analizando el archivo",
    };
  }
  return {
    phase: "scanning",
    stage: "PENDIENTE",
    label: "Archivo pendiente de análisis",
  };
}

function abortError() {
  return new DOMException("La carga fue cancelada", "AbortError");
}

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

export async function uploadPrivateFile(
  file: File,
  options: {
    signal?: AbortSignal;
    pollIntervalMs?: number;
    maxPolls?: number;
    onProgress?: (progress: FileUploadProgress) => void;
  } = {},
) {
  options.onProgress?.({
    phase: "uploading",
    stage: "PENDIENTE",
    label: "Subiendo archivo",
    fileId: null,
  });
  const body = new FormData();
  body.append("file", file);
  let response = await apiRequest<ApiEnvelope<PrivateFile>>("/api/files", {
    method: "POST",
    body,
    signal: options.signal,
  });
  let current = response.data;
  options.onProgress?.({
    ...fileScanPresentation(current.status),
    fileId: current.id,
  });

  const maxPolls = options.maxPolls ?? 120;
  for (let attempt = 0; !terminalStatuses.has(current.status); attempt += 1) {
    if (attempt >= maxPolls) {
      throw new Error("FILE_SCAN_TIMEOUT");
    }
    await wait(options.pollIntervalMs ?? 1500, options.signal);
    response = await apiRequest<ApiEnvelope<PrivateFile>>(
      `/api/files/${encodeURIComponent(current.id)}`,
      { signal: options.signal },
    );
    current = response.data;
    options.onProgress?.({
      ...fileScanPresentation(current.status),
      fileId: current.id,
    });
  }
  return current;
}
