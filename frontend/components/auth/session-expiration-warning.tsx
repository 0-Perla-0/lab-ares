"use client";
import { useEffect, useState } from "react";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import type { ApiEnvelope } from "@/lib/types";
type Status = {
  serverAt: string;
  absoluteExpiresAt: string;
  idleExpiresAt: string;
};
export function SessionExpirationWarning() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true,
      absolute = 0,
      idle = 0;
    // No polling request: passive UI timers must not keep a session alive.
    const receivedAt = Date.now();
    void apiRequest<ApiEnvelope<Status>>("/api/auth/session-status")
      .then((result) => {
        if (!active || !result?.data) return;
        const serverAt = Date.parse(result.data.serverAt);
        absolute =
          receivedAt + Date.parse(result.data.absoluteExpiresAt) - serverAt;
        idle = receivedAt + Date.parse(result.data.idleExpiresAt) - serverAt;
      })
      .catch(() => {
        /* normal API 401 handling already redirects; no guessed deadlines */
      });
    const activity = () => {
      if (absolute) idle = Math.min(absolute, Date.now() + 30 * 60_000);
    };
    const timer = window.setInterval(() => {
      if (!absolute) return;
      const seconds = Math.max(
        0,
        Math.ceil((Math.min(absolute, idle) - Date.now()) / 1000),
      );
      setRemaining(seconds);
    }, 1000);
    window.addEventListener("ares:session-activity", activity);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("ares:session-activity", activity);
    };
  }, [refresh]);
  if (remaining === null || remaining > 120) return null;
  return (
    <section
      aria-label="Caducidad de sesión"
      className="m-4 rounded-[var(--radius-card)] border border-[var(--color-warning-border)] bg-[var(--color-warning-soft)] p-4"
    >
      <p role="status">
        {remaining
          ? "Tu sesión está próxima a expirar. Confirma actividad si necesitas continuar."
          : "La sesión puede haber expirado. Verifica con el servidor antes de continuar."}
      </p>
      <p>
        Tiempo orientativo restante: {remaining} s. El límite absoluto de 8
        horas exige iniciar sesión nuevamente.
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        disabled={busy}
        className="focus-ring min-h-11 underline"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await apiRequest("/api/auth/session-status");
            setRefresh((value) => value + 1);
          } catch (cause) {
            setError(getApiErrorMessage(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        Verificar y mantener actividad
      </button>
    </section>
  );
}
