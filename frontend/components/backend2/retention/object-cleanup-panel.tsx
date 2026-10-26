"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Panel, StatusBadge } from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
import {
  retentionApi,
  type CleanupCandidate,
  type CleanupCandidates,
  type CleanupJob,
} from "@/lib/backend2/retention";

const kindLabel = {
  ORPHAN_OBJECT: "Objeto huérfano",
  QUARANTINE_COPY: "Copia de cuarentena",
} as const;
const stateLabel: Record<CleanupJob["state"], string> = {
  PREPARED: "Preparada",
  DISPATCHED: "Enviada",
  UNCERTAIN: "Resultado incierto",
  VERIFIED: "Verificada",
  COMPLETE: "Completa",
};

/** Governed, irreversible cleanup: every item is revalidated by the server. */
export function ObjectCleanupPanel() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<CleanupJob[]>([]);
  const [found, setFound] = useState<CleanupCandidates | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadJobs = useCallback(async () => {
    try {
      setJobs((await retentionApi.cleanupJobs()).items);
    } catch (cause) {
      setError(getApiErrorMessage(cause, "load"));
    }
  }, []);
  useEffect(() => void loadJobs(), [loadJobs]);

  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setMessage(done);
      await loadJobs();
    } catch (cause) {
      setError(getApiErrorMessage(cause, "save"));
    } finally {
      setBusy(false);
    }
  }

  const candidates: CleanupCandidate[] = found
    ? [...found.orphans, ...found.quarantineCopies]
    : [];

  return (
    <Panel
      title="Limpieza de objetos privados"
      description="Huérfanos y copias de cuarentena. Cada elemento se vuelve a validar contra referencias, retenciones legales, antigüedad y copia vigente antes de sellarse; sólo se eliminan las versiones selladas."
      action={
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(
              async () => setFound(await retentionApi.cleanupCandidates()),
              "Propuesta actualizada. Nada se ha eliminado.",
            )
          }
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--ares-border-strong)] bg-[var(--color-surface)] px-3 text-sm font-bold disabled:opacity-50"
        >
          <RefreshCw size={15} /> Buscar candidatos
        </button>
      }
    >
      {error && (
        <p
          role="alert"
          className="mb-3 text-sm font-bold text-[var(--color-danger-text)]"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mb-3 text-sm font-bold">
          {message}
        </p>
      )}
      {found && (
        <ul className="mb-4 grid gap-2">
          {candidates.length === 0 && (
            <li className="text-sm text-[var(--ares-muted)]">
              No hay candidatos.
            </li>
          )}
          {candidates.map((item) => (
            <li
              key={`${item.bucket}:${item.key}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[var(--ares-border)] p-3"
            >
              <span className="min-w-0 text-sm">
                <strong>{kindLabel[item.kind]}</strong> · {item.bucket}
                <span className="block break-all font-mono text-xs text-[var(--ares-muted)]">
                  {item.key}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  window.confirm(
                    "La eliminación es irreversible para las versiones selladas. ¿Continuar?",
                  ) &&
                  void run(async () => {
                    await retentionApi.cleanupObject(user.id, item);
                    setFound(null);
                  }, "Limpieza completada y verificada.")
                }
                className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--color-danger-solid)] px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                <Trash2 size={15} /> Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="grid gap-2">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[var(--ares-border)] p-3 text-sm"
          >
            <span>
              {kindLabel[job.kind]} · {job.bucket} ·{" "}
              {new Date(job.createdAt).toLocaleString("es-MX")}
            </span>
            <span className="flex items-center gap-2">
              <StatusBadge
                label={stateLabel[job.state]}
                tone={
                  job.state === "COMPLETE"
                    ? "success"
                    : job.state === "UNCERTAIN"
                      ? "danger"
                      : "warning"
                }
              />
              {(job.state === "UNCERTAIN" || job.state === "DISPATCHED") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => retentionApi.reconcileCleanup(user.id, job.id),
                      "Conciliación solicitada.",
                    )
                  }
                  className="focus-ring min-h-11 rounded-full border border-[var(--ares-border-strong)] px-3 text-sm font-bold disabled:opacity-50"
                >
                  Conciliar
                </button>
              )}
            </span>
          </li>
        ))}
        {jobs.length === 0 && (
          <li className="text-sm text-[var(--ares-muted)]">
            Sin tareas de limpieza.
          </li>
        )}
      </ul>
    </Panel>
  );
}
