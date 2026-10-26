"use client";
import { useCallback, useEffect, useState } from "react";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import type { ApiEnvelope } from "@/lib/types";
import {
  LoadError,
  LoadingTable,
  PageHeader,
} from "@/components/ui/primitives";
type Notification = {
  id: string;
  type: string;
  createdAt: string;
  readAt: string | null;
};
export function NotificationsPage() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await apiRequest<ApiEnvelope<Notification[]>>(
      `/api/notifications?page=${page}&limit=20`,
    );
    setItems(response.data);
  }, [page]);
  useEffect(() => {
    void load().catch((cause) => setError(getApiErrorMessage(cause, "load")));
  }, [load]);
  async function read(id?: string) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(
        id
          ? `/api/notifications/${encodeURIComponent(id)}/read`
          : "/api/notifications/read-all",
        { method: id ? "PATCH" : "POST" },
      );
      await load();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!items && error)
    return (
      <LoadError
        message={error}
        onRetry={() =>
          void load().catch((cause) => setError(getApiErrorMessage(cause)))
        }
      />
    );
  if (!items) return <LoadingTable />;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Mis notificaciones"
        description="Avisos privados de tu cuenta y operaciones."
      />
      {error && <p role="alert">{error}</p>}
      <button
        disabled={busy}
        className="focus-ring min-h-11 underline"
        onClick={() => void read()}
      >
        Marcar todas como leídas
      </button>
      {!items.length && <p>No hay notificaciones en esta página.</p>}
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id} className="rounded-[var(--radius-card)] border p-4">
            <h2 className="font-bold">{item.type.replaceAll("_", " ")}</h2>
            <time dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleString("es-MX")}
            </time>
            <p>{item.readAt ? "Leída" : "Sin leer"}</p>
            {!item.readAt && (
              <button
                disabled={busy}
                className="focus-ring min-h-11 underline"
                onClick={() => void read(item.id)}
              >
                Marcar como leída
              </button>
            )}
          </li>
        ))}
      </ul>
      <nav aria-label="Paginación de notificaciones" className="flex gap-4">
        <button disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          disabled={items.length < 20 || busy}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </button>
      </nav>
    </div>
  );
}
