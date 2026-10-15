"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ApiError, apiRequest, getApiErrorMessage } from "@/lib/api";
import { hasPermission, permissions } from "@/lib/permissions";
import {
  clearIdempotencyKey,
  formatDuration,
  idempotencyKey,
  type Attendance,
} from "@/lib/attendance";
import type { ApiEnvelope } from "@/lib/types";
import { ContingencyForm } from "./contingency-form";
import {
  Field,
  ForbiddenState,
  PageHeader,
  inputClassName,
  textareaClassName,
} from "@/components/ui/primitives";
type Row = Attendance & {
  version: number;
  risk: NonNullable<Attendance["risk"]>;
};
export function AttendanceReviewPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user, permissions.ATTENDANCE_MANAGE);
  const validate = hasPermission(user, permissions.HOURS_VALIDATE);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("PENDIENTE");
  const [cursor, setCursor] = useState<number | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{
    id: number;
    events: {
      id: number;
      action: string;
      reason: string | null;
      occurredAt: string;
    }[];
    validations: {
      id: number;
      decision: string;
      reason: string;
      occurredAt: string;
    }[];
  } | null>(null);
  const load = useCallback(async () => {
    if (!allowed) return;
    const result = await apiRequest<
      ApiEnvelope<{ items: Row[]; nextCursor: number | null }>
    >(
      `/api/attendance/review?status=${status}&limit=20${cursor ? `&cursor=${cursor}` : ""}`,
    );
    setRows(result.data.items);
    setNext(result.data.nextCursor);
    setSelected([]);
  }, [allowed, status, cursor]);
  useEffect(() => {
    void load().catch((cause) => setError(getApiErrorMessage(cause, "load")));
  }, [load]);
  async function mutate(
    path: string,
    operation: string,
    target: string,
    body: object,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const payload = JSON.stringify(body);
    const key = idempotencyKey(user.id, operation, target, payload);
    try {
      await apiRequest(path, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: payload,
      });
      clearIdempotencyKey(user.id, operation, target);
      setNotice(
        "Operación confirmada. La bolsa refleja sólo decisiones autorizadas.",
      );
      await load();
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![408, 429].includes(cause.status) &&
        cause.code !== "ATTENDANCE_RETRY_REQUIRED"
      )
        clearIdempotencyKey(user.id, operation, target);
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function decision(event: FormEvent<HTMLFormElement>, row: Row) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate(
      `/api/attendance/${row.id}/validate`,
      "validate",
      String(row.id),
      {
        version: row.version,
        decision: form.get("decision"),
        reason: form.get("reason"),
      },
    );
  }
  function correction(event: FormEvent<HTMLFormElement>, row: Row) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate(
      `/api/attendance/${row.id}/correct`,
      "correct",
      String(row.id),
      {
        version: row.version,
        checkInAt: new Date(String(form.get("start"))).toISOString(),
        checkOutAt: new Date(String(form.get("end"))).toISOString(),
        reason: form.get("reason"),
      },
    );
  }
  async function showHistory(id: number) {
    setError("");
    try {
      const result = await apiRequest<
        ApiEnvelope<Omit<NonNullable<typeof history>, "id">>
      >(`/api/attendance/${id}/history`);
      setHistory({ id, ...result.data });
    } catch (cause) {
      setError(getApiErrorMessage(cause, "load"));
    }
  }
  if (!allowed) return <ForbiddenState />;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Servicio Social"
        title="Revisión y validación"
        description="Coordinación corrige; las jefaturas autorizan. No hay autovalidación ni validación por quien corrigió."
      />
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <ContingencyForm reload={load} />
      <Field label="Estado">
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setCursor(null);
          }}
          className={inputClassName}
        >
          {["PENDIENTE", "AUTORIZADA", "RECHAZADA"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <button
        disabled={busy}
        onClick={() =>
          void load().catch((cause) => setError(getApiErrorMessage(cause)))
        }
        className="focus-ring min-h-11 underline"
      >
        Actualizar
      </button>
      {!rows.length && <p>No hay registros en esta página.</p>}
      <ul className="space-y-4">
        {rows.map((row) => (
          <li
            key={`${row.id}-${row.version}`}
            className="space-y-4 rounded-2xl border bg-white p-5"
          >
            <h2 className="font-bold">
              {row.user.codigo} · #{row.id} · versión {row.version}
            </h2>
            <p>
              {new Date(row.checkInAt).toLocaleString("es-MX")} —{" "}
              {row.checkOutAt
                ? new Date(row.checkOutAt).toLocaleString("es-MX")
                : "Abierta"}{" "}
              · {formatDuration(row.durationSeconds ?? 0)}
            </p>
            <p>
              Riesgo {row.risk.color} · reglas v{row.risk.policyVersion} ·{" "}
              {row.risk.reasons.join(", ") || "Sin incidencias"}
            </p>
            {row.requiresReview && (
              <p>
                REQUIERE_REVISION: corregir la salida omitida antes de
                autorizar.
              </p>
            )}
            <button
              className="focus-ring min-h-11 underline"
              onClick={() => void showHistory(row.id)}
            >
              Ver historial #{row.id}
            </button>
            {status === "PENDIENTE" && (
              <>
                {validate && row.userId !== user.id && (
                  <form
                    onSubmit={(event) => decision(event, row)}
                    className="space-y-3"
                  >
                    <Field label="Decisión">
                      <select name="decision" className={inputClassName}>
                        <option
                          value="AUTORIZADA"
                          disabled={row.requiresReview}
                        >
                          Autorizar
                        </option>
                        <option value="RECHAZADA">Rechazar</option>
                      </select>
                    </Field>
                    <ReasonField />
                    <button
                      disabled={busy}
                      className="focus-ring min-h-11 rounded-xl border px-4"
                    >
                      Confirmar decisión individual
                    </button>
                  </form>
                )}
                <details>
                  <summary className="focus-ring cursor-pointer">
                    Corregir intervalo con historial
                  </summary>
                  <form
                    onSubmit={(event) => correction(event, row)}
                    className="mt-4 space-y-3"
                  >
                    <p>
                      Horas en la zona local de este dispositivo; el servidor
                      exige el mismo día de México y no permite solapamientos.
                    </p>
                    <Field label="Entrada corregida">
                      <input
                        type="datetime-local"
                        name="start"
                        required
                        defaultValue={localInput(row.checkInAt)}
                        className={inputClassName}
                      />
                    </Field>
                    <Field label="Salida corregida">
                      <input
                        type="datetime-local"
                        name="end"
                        required
                        defaultValue={
                          row.checkOutAt ? localInput(row.checkOutAt) : ""
                        }
                        className={inputClassName}
                      />
                    </Field>
                    <ReasonField />
                    <button
                      disabled={busy}
                      className="focus-ring min-h-11 rounded-xl border px-4"
                    >
                      Registrar corrección
                    </button>
                  </form>
                </details>
                {validate &&
                  row.risk.color === "VERDE" &&
                  row.userId !== user.id && (
                    <label className="flex min-h-11 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={(event) =>
                          setSelected((ids) =>
                            event.target.checked
                              ? [...ids, row.id]
                              : ids.filter((id) => id !== row.id),
                          )
                        }
                      />
                      Seleccionar #{row.id} para aprobación verde
                    </label>
                  )}
              </>
            )}
          </li>
        ))}
      </ul>
      {validate && status === "PENDIENTE" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            if (
              window.confirm(`¿Autorizar ${selected.length} registros verdes?`)
            )
              void mutate(
                "/api/attendance/validate-batch",
                "batch",
                selected.join("-"),
                {
                  items: rows
                    .filter((row) => selected.includes(row.id))
                    .map((row) => ({ id: row.id, version: row.version })),
                  reason: form.get("reason"),
                },
              );
          }}
          className="space-y-4 rounded-xl border p-4"
        >
          <p>
            Aprobación masiva: sólo verde, máximo 100, atómica. Cualquier cambio
            obliga a refrescar.
          </p>
          <ReasonField />
          <button
            disabled={busy || !selected.length}
            className="focus-ring min-h-11 rounded-xl border px-4"
          >
            Autorizar seleccionadas ({selected.length})
          </button>
        </form>
      )}
      <nav aria-label="Paginación de validaciones" className="flex gap-4">
        <button disabled={!cursor || busy} onClick={() => setCursor(null)}>
          Volver al inicio
        </button>
        <button disabled={!next || busy} onClick={() => setCursor(next)}>
          Siguiente página
        </button>
      </nav>
      {history && (
        <section
          aria-label="Historial de asistencia"
          className="rounded-xl border p-5"
        >
          <h2 className="font-bold">Historial #{history.id}</h2>
          <ul>
            {history.events.map((event) => (
              <li key={`e${event.id}`}>
                {event.action} · {event.reason} ·{" "}
                {new Date(event.occurredAt).toLocaleString("es-MX")}
              </li>
            ))}
            {history.validations.map((event) => (
              <li key={`v${event.id}`}>
                {event.decision} · {event.reason} ·{" "}
                {new Date(event.occurredAt).toLocaleString("es-MX")}
              </li>
            ))}
          </ul>
          <button
            className="focus-ring min-h-11 underline"
            onClick={() => setHistory(null)}
          >
            Cerrar historial
          </button>
        </section>
      )}
    </div>
  );
}
function ReasonField() {
  return (
    <Field label="Motivo obligatorio">
      <textarea
        name="reason"
        required
        minLength={5}
        maxLength={500}
        className={textareaClassName}
      />
    </Field>
  );
}
function localInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
