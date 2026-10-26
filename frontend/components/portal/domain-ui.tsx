"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest } from "@/lib/api";
import { socialError, socialMutation } from "@/lib/service-social";
import { Field, inputClassName } from "@/components/ui/primitives";
import { pendingIdempotencyKey } from "@/lib/attendance";
export const actionClass =
  "focus-ring min-h-11 rounded-full border px-4 py-2 disabled:opacity-50";
export function DomainInput({
  name,
  label,
  type = "text",
  required = true,
  maxLength,
  min,
  step,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  min?: number;
  step?: string;
  defaultValue?: string | number;
}) {
  return (
    <Field label={label}>
      <input
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        min={min}
        step={step}
        defaultValue={defaultValue}
        className={inputClassName}
      />
    </Field>
  );
}
export function useDomainData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const id = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{ data: T }>(path);
      if (!result || !("data" in result)) throw new Error("Unknown response");
      if (id === sequence.current) setData(result.data);
    } catch (cause) {
      if (id === sequence.current)
        setError(
          cause instanceof ApiError && cause.code === "FEATURE_DISABLED"
            ? "Este módulo está deshabilitado en este entorno."
            : "No se pudo cargar la información. Reintenta.",
        );
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setData(null);
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  return { data, error, loading, load };
}
export function useDomainAction(
  userId: number,
  onSuccess: () => Promise<unknown> | void,
) {
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locked = useRef(false);
  const pending = useRef<{ path: string; body: object; method: string } | null>(
    null,
  );
  async function send<T>(
    path: string,
    body: object,
    method = "POST",
  ): Promise<T | undefined> {
    if (
      locked.current ||
      (pending.current &&
        (path !== pending.current.path ||
          JSON.stringify(body) !== JSON.stringify(pending.current.body)))
    )
      return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    pending.current = { path, body, method };
    try {
      const data = await socialMutation<T>(userId, path, body, method, true);
      pending.current = null;
      setUncertain(false);
      setNotice("Operación confirmada por el servidor.");
      await onSuccess();
      return data;
    } catch (cause) {
      const definitive =
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![408, 429].includes(cause.status) &&
        !["RETRY_REQUIRED", "ATTENDANCE_RETRY_REQUIRED"].includes(cause.code);
      if (definitive) {
        pending.current = null;
        setUncertain(false);
      } else setUncertain(true);
      setError(socialError(cause));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function retry() {
    if (pending.current)
      void send(
        pending.current.path,
        pending.current.body,
        pending.current.method,
      );
  }
  async function reconcile() {
    const intent = pending.current;
    if (!intent || locked.current) return;
    const key = pendingIdempotencyKey(
      userId,
      `social:${intent.method}`,
      intent.path,
    );
    if (!key) return;
    locked.current = true;
    setBusy(true);
    try {
      const result = await apiRequest<{ data: { state: string } }>(
        `/api/operation-intents/${encodeURIComponent(key)}`,
      );
      setNotice(
        result.data.state === "COMMITTED"
          ? "Existe una confirmación durable. Reintenta la misma operación para recuperar la respuesta bajo tus permisos actuales."
          : "Aún no hay confirmación durable; la operación puede seguir en curso. Conserva los datos y la misma clave.",
      );
    } catch {
      setError(
        "No se pudo consultar la confirmación. La intención sigue pendiente.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return {
    send,
    busy,
    uncertain,
    error,
    notice,
    retry,
    reconcile,
    disabled: busy || uncertain,
  };
}
export function DomainFeedback({
  action,
}: {
  action: ReturnType<typeof useDomainAction>;
}) {
  return (
    <>
      {action.error && <p role="alert">{action.error}</p>}
      {action.notice && <p role="status">{action.notice}</p>}
      {action.uncertain && (
        <button
          type="button"
          className={actionClass}
          disabled={action.busy}
          onClick={() => void action.reconcile()}
        >
          Consultar confirmación sin reenviar
        </button>
      )}
      {action.uncertain && (
        <button
          type="button"
          className={actionClass}
          disabled={action.busy}
          onClick={action.retry}
        >
          Reintentar la misma operación sin cambiar datos
        </button>
      )}
    </>
  );
}
export function ReadFeedback({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return (
    <>
      {loading && <p role="status">Cargando…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button className={actionClass} onClick={retry}>
            Reintentar consulta
          </button>
        </div>
      )}
    </>
  );
}
