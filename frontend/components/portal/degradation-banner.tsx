"use client";
import { useEffect, useState } from "react";
import { apiRequest, lastApiSnapshot } from "@/lib/api";
export function DegradationBanner() {
  const [active, setActive] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [backendSnapshot, setBackendSnapshot] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const receive = () => {
      setSnapshot((prior) => prior ?? lastApiSnapshot());
      setActive(true);
      void apiRequest<{ data: { snapshotAt?: string | null } }>(
        "/api/health/operating-mode",
      )
        .then((result) => setBackendSnapshot(result?.data?.snapshotAt ?? null))
        .catch(() => {});
    };
    window.addEventListener("ares:write-barrier", receive);
    return () => window.removeEventListener("ares:write-barrier", receive);
  }, []);
  async function check() {
    setChecking(true);
    setError("");
    try {
      const result = await apiRequest<{ data: { readOnly: boolean } }>(
        "/api/health/operating-mode",
      );
      if (!result?.data) throw new Error("Unknown state");
      setActive(result.data.readOnly);
      if (!result.data.readOnly) setSnapshot(null);
    } catch {
      setError("No se pudo confirmar el estado. Continúa el modo lectura.");
    } finally {
      setChecking(false);
    }
  }
  if (!active) return null;
  return (
    <section
      role="alert"
      className="border-b border-amber-300 bg-amber-50 p-4 text-amber-950"
    >
      <h2 className="font-bold">Modo Lectura / Mantenimiento Operativo</h2>
      <p>
        Último snapshot válido del backend:{" "}
        {backendSnapshot
          ? new Date(backendSnapshot).toLocaleString("es-MX")
          : "no disponible"}
        .
      </p>
      <p>
        Escrituras pausadas por recuperación. Último snapshot válido en este
        navegador:{" "}
        {snapshot
          ? new Date(snapshot).toLocaleString("es-MX")
          : "no disponible"}
        . No hay cambios confirmados por esta solicitud.
      </p>
      <button
        disabled={checking}
        onClick={() => void check()}
        className="focus-ring min-h-11 underline"
      >
        Comprobar estado operativo
      </button>
      {error && <p>{error}</p>}
    </section>
  );
}
