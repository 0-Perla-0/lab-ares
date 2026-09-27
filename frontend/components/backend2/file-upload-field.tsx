"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileCheck2, LoaderCircle, UploadCloud, X } from "lucide-react";

import { StatusBadge, type StatusTone } from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
import {
  uploadPrivateFile,
  type FileUploadProgress,
  type PrivateFile,
} from "@/lib/backend2/file-upload";

const stageTone: Record<FileUploadProgress["stage"], StatusTone> = {
  PENDIENTE: "warning",
  EN_ANALISIS: "info",
  DISPONIBLE: "success",
  RECHAZADO: "danger",
};

export function FileUploadField({
  label = "Archivo",
  hint,
  accept,
  disabled = false,
  required = false,
  maxBytes,
  onFileReady,
  onStatusChange,
}: {
  label?: string;
  hint?: string;
  accept?: string;
  disabled?: boolean;
  required?: boolean;
  maxBytes?: number;
  onFileReady: (fileId: string, file: PrivateFile) => void;
  onStatusChange?: (progress: FileUploadProgress | null) => void;
}) {
  const generatedId = useId().replaceAll(":", "");
  const inputId = `upload-${generatedId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const statusId = `${inputId}-status`;
  const [progress, setProgress] = useState<FileUploadProgress | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  function publish(next: FileUploadProgress | null) {
    setProgress(next);
    onStatusChange?.(next);
  }

  async function chooseFile(file: File | undefined) {
    controller.current?.abort();
    setError("");
    publish(null);
    if (!file) {
      setFileName("");
      return;
    }
    setFileName(file.name);
    if (maxBytes && file.size > maxBytes) {
      setError(`El archivo excede el máximo de ${formatBytes(maxBytes)}.`);
      return;
    }

    const nextController = new AbortController();
    controller.current = nextController;
    try {
      const uploaded = await uploadPrivateFile(file, {
        signal: nextController.signal,
        onProgress: publish,
      });
      if (uploaded.status === "DISPONIBLE") {
        onFileReady(uploaded.id, uploaded);
      }
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        publish(null);
        return;
      }
      setError(
        requestError instanceof Error &&
          requestError.message === "FILE_SCAN_TIMEOUT"
          ? "El análisis continúa. Vuelve a consultar el archivo en unos minutos."
          : getApiErrorMessage(requestError, "save"),
      );
    } finally {
      if (controller.current === nextController) controller.current = null;
    }
  }

  const busy =
    progress?.phase === "uploading" || progress?.phase === "scanning";
  const describedBy = [
    hintId,
    progress ? statusId : undefined,
    error ? `${inputId}-error` : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <label
        htmlFor={inputId}
        className="text-sm font-extrabold text-[#32473d]"
      >
        {label}
        {required && (
          <span className="ml-1 text-[#b94d1f]" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (obligatorio)</span>}
      </label>
      <div className="mt-2 rounded-2xl border border-[var(--ares-border-strong)] bg-[var(--ares-surface)] p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label
            htmlFor={inputId}
            className={`file-upload-trigger inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--ares-ink)] px-4 text-sm font-black text-white transition hover:bg-[var(--ares-ink-soft)] ${
              disabled || busy ? "pointer-events-none opacity-55" : ""
            }`}
          >
            <UploadCloud size={18} aria-hidden="true" />
            {busy ? "Procesando…" : "Seleccionar archivo"}
            <input
              id={inputId}
              type="file"
              accept={accept}
              required={required}
              disabled={disabled || busy}
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy || undefined}
              className="sr-only"
              onChange={(event) =>
                void chooseFile(event.currentTarget.files?.[0])
              }
            />
          </label>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ares-muted)]">
            {fileName || "Ningún archivo seleccionado"}
          </p>
          {busy && (
            <button
              type="button"
              onClick={() => controller.current?.abort()}
              className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--ares-border-strong)] px-3 text-sm font-extrabold"
            >
              <X size={16} aria-hidden="true" /> Cancelar
            </button>
          )}
        </div>

        {progress && (
          <div
            id={statusId}
            role="status"
            aria-live="polite"
            aria-busy={busy}
            className="mt-4 border-t border-[var(--ares-border)] pt-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge
                label={progress.stage.replace("_", " ")}
                tone={stageTone[progress.stage]}
              />
              <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--ares-muted)]">
                {busy ? (
                  <LoaderCircle
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <FileCheck2 size={16} aria-hidden="true" />
                )}
                {progress.label}
              </span>
            </div>
            <progress
              className="ares-progress mt-3"
              aria-label={progress.label}
              {...(["ready", "rejected"].includes(progress.phase)
                ? { value: 100, max: 100 }
                : {})}
            />
          </div>
        )}
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs font-medium text-[#5f6d66]">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-1.5 text-xs font-bold text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
