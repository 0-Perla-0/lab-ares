"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock3,
  LogIn,
  LogOut,
  RefreshCw,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { LoadError, LoadingTable } from "@/components/ui/primitives";
import { ApiError, apiRequest, getApiErrorMessage } from "@/lib/api";
import {
  formatDate,
  formatDuration,
  idempotencyKey,
  clearIdempotencyKey,
  reconcileCheckIn,
  type Attendance,
  type AttendancePage as AttendanceResponse,
} from "@/lib/attendance";

type Envelope = { data: AttendanceResponse };
const canReview = (role: string) => role !== "PRESTADOR";

export function AttendancePage() {
  const { user } = useAuth();
  const [mine, setMine] = useState<AttendanceResponse | null>(null);
  const [review, setReview] = useState<AttendanceResponse | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [reviewCursor, setReviewCursor] = useState<number | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [reasonFor, setReasonFor] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [clock, setClock] = useState({ server: Date.now(), mono: 0 });
  const [loading, setLoading] = useState(false);
  const loadSequence = useRef(0);
  const busyRef = useRef(false);

  const load = useCallback(
    async (
      nextCursor: number | null = null,
      nextReviewCursor: number | null = null,
    ) => {
      const sequence = ++loadSequence.current;
      setLoading(true);
      setError("");
      try {
        const own = await apiRequest<Envelope>(
          `/api/attendance/me?limit=20${nextCursor ? `&cursor=${nextCursor}` : ""}`,
        );
        if (sequence !== loadSequence.current) return;
        setMine(own.data);
        reconcileCheckIn(user.id, !!own.data.open);
        setCursor(nextCursor);
        setClock({
          server: new Date(own.data.serverTime).getTime(),
          mono: performance.now(),
        });
        if (canReview(user.rol)) {
          try {
            const queue = await apiRequest<Envelope>(
              `/api/attendance/open?limit=20${nextReviewCursor ? `&cursor=${nextReviewCursor}` : ""}`,
            );
            if (sequence !== loadSequence.current) return;
            setReview(queue.data);
            setReviewCursor(nextReviewCursor);
            setReviewError("");
          } catch (e) {
            if (sequence === loadSequence.current)
              setReviewError(getApiErrorMessage(e, "load"));
          }
        }
      } catch (e) {
        if (sequence === loadSequence.current)
          setError(getApiErrorMessage(e, "load"));
      } finally {
        if (sequence === loadSequence.current) setLoading(false);
      }
    },
    [user.id, user.rol],
  );

  useEffect(() => {
    void load();
    return () => {
      loadSequence.current++;
    };
  }, [load]);
  useEffect(() => {
    const id = window.setInterval(
      () => setClock((value) => ({ ...value })),
      1000,
    );
    return () => window.clearInterval(id);
  }, []);

  async function mutate(operation: "check-in" | "check-out", target = "") {
    if (busyRef.current || loading) return;
    busyRef.current = true;
    setBusy(operation);
    try {
      const payload = JSON.stringify(
        operation === "check-out" ? { attendanceId: Number(target) } : {},
      );
      const key = idempotencyKey(user.id, operation, target, payload);
      await apiRequest(`/api/attendance/${operation}`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: payload,
      });
      clearIdempotencyKey(user.id, operation, target);
      await load(null, reviewCursor);
    } catch (e) {
      if (isDefinitiveFailure(e))
        clearIdempotencyKey(user.id, operation, target);
      setError(getApiErrorMessage(e, "save"));
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  async function closeAttendance(item: Attendance) {
    if (reason.trim().length < 5 || busyRef.current || loading) return;
    busyRef.current = true;
    setBusy(`close-${item.id}`);
    try {
      const payload = JSON.stringify({ reason: reason.trim() });
      const key = idempotencyKey(user.id, "close", String(item.id), payload);
      await apiRequest(`/api/attendance/${item.id}/close`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: payload,
      });
      clearIdempotencyKey(user.id, "close", String(item.id));
      setReasonFor(null);
      setReason("");
      await load(cursor, reviewCursor);
    } catch (e) {
      if (isDefinitiveFailure(e))
        clearIdempotencyKey(user.id, "close", String(item.id));
      setError(getApiErrorMessage(e, "save"));
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  if (error && !mine)
    return <LoadError message={error} onRetry={() => void load()} />;
  if (!mine) return <LoadingTable />;
  const open = mine.open;
  const elapsed = open
    ? Math.max(
        0,
        Math.floor(
          (clock.server +
            (performance.now() - clock.mono) -
            new Date(open.checkInAt).getTime()) /
            1000,
        ),
      )
    : 0;
  const bank = mine.bank ?? {
    pendingSeconds: 0,
    authorizedSeconds: 0,
    rejectedSeconds: 0,
  };

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[.19em] text-[#769a27]">
            Control de jornada
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-.045em] sm:text-4xl">
            Asistencia
          </h1>
          <p className="mt-2 text-sm text-[#66736d]">
            Registra tus entradas y salidas con la hora oficial del servidor.
          </p>
        </div>
        <button
          type="button"
          disabled={busy !== "" || loading}
          onClick={() => void load(cursor, reviewCursor)}
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-xl border border-[#12221b]/10 bg-white px-4 py-2 text-sm font-extrabold"
        >
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"
        >
          {error}
        </div>
      )}
      <section className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-[1.6rem] bg-[#12221b] p-6 text-white sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#c8f169] text-[#12221b]">
              <Clock3 size={21} />
            </span>
            <div>
              <p className="text-xs font-bold text-white/45">Estado actual</p>
              <h2 className="text-xl font-black">
                {open ? "Sesión abierta" : "Sin sesión abierta"}
              </h2>
            </div>
          </div>
          {open ? (
            <>
              <p className="mt-8 font-mono text-4xl font-black tracking-tight">
                {formatDuration(elapsed)}
              </p>
              <p className="mt-2 text-sm text-white/55">
                Desde {formatDate(open.checkInAt, mine.timeZone)}
              </p>
              {elapsed >= mine.abnormalAfterSeconds && (
                <p
                  role="status"
                  className="mt-3 text-sm font-bold text-amber-200"
                >
                  Esta sesión lleva más de{" "}
                  {formatDuration(mine.abnormalAfterSeconds)} abierta. Revisa si
                  falta registrar tu salida.
                </p>
              )}
              <button
                type="button"
                disabled={busy !== "" || loading}
                onClick={() => void mutate("check-out", String(open.id))}
                className="focus-ring mt-7 inline-flex items-center gap-2 rounded-xl bg-[#f4834f] px-5 py-3 text-sm font-black text-[#12221b] disabled:opacity-50"
              >
                <LogOut size={17} />{" "}
                {busy === "check-out" ? "Registrando…" : "Registrar salida"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy !== "" || loading}
              onClick={() => void mutate("check-in")}
              className="focus-ring mt-8 inline-flex items-center gap-2 rounded-xl bg-[#c8f169] px-5 py-3 text-sm font-black text-[#12221b] disabled:opacity-50"
            >
              <LogIn size={17} />{" "}
              {busy === "check-in" ? "Registrando…" : "Registrar entrada"}
            </button>
          )}
        </div>
        <div className="rounded-[1.6rem] border border-[#12221b]/10 bg-white p-6 sm:p-8">
          <p className="text-[10px] font-black uppercase tracking-[.17em] text-[#769a27]">
            Bolsa de horas
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <Stat label="Pendientes" value={bank.pendingSeconds} />
            <Stat label="Autorizadas" value={bank.authorizedSeconds} />
            <Stat label="Rechazadas" value={bank.rejectedSeconds} />
          </div>
        </div>
      </section>
      <History items={mine.items} timeZone={mine.timeZone} />
      <div className="mt-5 flex gap-3">
        {mine.nextCursor !== null && (
          <button
            disabled={busy !== "" || loading}
            type="button"
            onClick={() => void load(mine.nextCursor, reviewCursor)}
            className="focus-ring rounded-xl border border-[#12221b]/10 bg-white px-4 py-2 text-sm font-extrabold disabled:opacity-50"
          >
            Página siguiente del historial
          </button>
        )}
        {cursor !== null && (
          <button
            disabled={busy !== "" || loading}
            type="button"
            onClick={() => void load(null, reviewCursor)}
            className="focus-ring rounded-xl border border-[#12221b]/10 bg-white px-4 py-2 text-sm font-extrabold disabled:opacity-50"
          >
            Historial reciente
          </button>
        )}
      </div>
      {canReview(user.rol) && (
        <Review
          items={review?.items ?? []}
          error={reviewError}
          nextCursor={review?.nextCursor ?? null}
          timeZone={review?.timeZone ?? mine.timeZone}
          reasonFor={reasonFor}
          setReasonFor={setReasonFor}
          reason={reason}
          setReason={setReason}
          busy={loading ? "loading" : busy}
          loading={!review && loading}
          onClose={closeAttendance}
          onNext={() => void load(cursor, review?.nextCursor ?? null)}
          onFirst={
            reviewCursor !== null ? () => void load(cursor, null) : undefined
          }
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-bold text-[#66736d]">{label}</p>
      <p className="mt-1 text-xl font-black">{formatDuration(value)}</p>
    </div>
  );
}
function isDefinitiveFailure(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429 &&
    error.code !== "ATTENDANCE_RETRY_REQUIRED"
  );
}
function History({
  items,
  timeZone,
}: {
  items: Attendance[];
  timeZone: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-black">Tu historial</h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-[#12221b]/10 bg-white">
        {items.length === 0 ? (
          <p className="p-6 text-sm text-[#66736d]">
            Aún no hay registros de asistencia.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 border-b border-[#12221b]/8 p-4 last:border-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-black">
                  {formatDate(item.checkInAt, timeZone)} · {item.status}
                </p>
                <p className="text-xs text-[#66736d]">
                  {item.checkOutAt
                    ? `Salida ${formatDate(item.checkOutAt, timeZone)}`
                    : "Sesión abierta"}
                  {item.closeReason ? ` · ${item.closeReason}` : ""}
                </p>
              </div>
              <span className="text-sm font-black">
                {item.durationSeconds === null
                  ? "En curso"
                  : formatDuration(item.durationSeconds)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
function Review({
  items,
  error,
  nextCursor,
  timeZone,
  reasonFor,
  setReasonFor,
  reason,
  setReason,
  busy,
  onClose,
  onNext,
  onFirst,
  loading,
}: {
  items: Attendance[];
  error: string;
  nextCursor: number | null;
  timeZone: string;
  reasonFor: number | null;
  setReasonFor: (id: number | null) => void;
  reason: string;
  setReason: (value: string) => void;
  busy: string;
  onClose: (item: Attendance) => Promise<void>;
  onNext: () => void;
  onFirst?: () => void;
  loading: boolean;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-black">Sesiones abiertas en tu ámbito</h2>
      {loading ? (
        <p role="status" className="mt-4 text-sm">
          Cargando sesiones…
        </p>
      ) : error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-800"
        >
          {error}
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#12221b]/10 bg-white">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-[#66736d]">
              No hay sesiones pendientes de cierre.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="border-b border-[#12221b]/8 p-4 last:border-0"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black">
                      {item.user.codigo} ·{" "}
                      {formatDate(item.checkInAt, timeZone)}
                    </p>
                    <p className="text-xs text-[#66736d]">
                      {item.abnormal && (
                        <span className="mr-2 inline-flex items-center gap-1 font-black text-amber-700">
                          <AlertTriangle size={13} /> Tiempo fuera de rango
                        </span>
                      )}
                      {item.abnormal ? "Requiere revisión" : "Sesión abierta"}
                    </p>
                  </div>
                  <button
                    disabled={busy !== ""}
                    type="button"
                    onClick={() => {
                      setReasonFor(reasonFor === item.id ? null : item.id);
                      setReason("");
                    }}
                    className="focus-ring inline-flex items-center gap-2 rounded-xl border border-[#12221b]/10 px-3 py-2 text-xs font-black disabled:opacity-50"
                  >
                    <X size={14} /> Cerrar sesión
                  </button>
                </div>
                {reasonFor === item.id && (
                  <form
                    className="mt-4 rounded-xl bg-[#f7f7f3] p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void onClose(item);
                    }}
                  >
                    <label
                      className="text-xs font-black"
                      htmlFor={`reason-${item.id}`}
                    >
                      Motivo del cierre
                    </label>
                    <textarea
                      disabled={busy !== ""}
                      id={`reason-${item.id}`}
                      required
                      minLength={5}
                      maxLength={500}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="focus-ring mt-2 min-h-20 w-full rounded-xl border border-[#12221b]/10 bg-white p-3 text-sm"
                      placeholder="Describe por qué se cierra esta sesión"
                    />
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy !== ""}
                        onClick={() => setReasonFor(null)}
                        className="focus-ring rounded-xl px-3 py-2 text-xs font-black"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={reason.trim().length < 5 || busy !== ""}
                        className="focus-ring inline-flex items-center gap-2 rounded-xl bg-[#12221b] px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                      >
                        <Check size={14} /> Confirmar cierre
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ))
          )}
        </div>
      )}
      {nextCursor !== null && (
        <button
          disabled={busy !== ""}
          type="button"
          onClick={onNext}
          className="focus-ring mt-4 rounded-xl border border-[#12221b]/10 bg-white px-4 py-2 text-sm font-extrabold disabled:opacity-50"
        >
          Página siguiente de sesiones
        </button>
      )}
      {onFirst && (
        <button
          type="button"
          disabled={busy !== ""}
          onClick={onFirst}
          className="focus-ring ml-3 mt-4 rounded-xl border border-[#12221b]/10 bg-white px-4 py-2 text-sm font-extrabold disabled:opacity-50"
        >
          Primeras sesiones
        </button>
      )}
    </section>
  );
}
