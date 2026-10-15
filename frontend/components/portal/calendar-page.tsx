"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import { hasPermission, permissions, permissionScope } from "@/lib/permissions";
import {
  socialError,
  socialMutation,
  type CalendarData,
  type CalendarEvent,
  type Preview,
} from "@/lib/service-social";
import type { ApiEnvelope } from "@/lib/types";
import {
  Field,
  ForbiddenState,
  FormActions,
  Modal,
  PageHeader,
  Panel,
  inputClassName,
  textareaClassName,
} from "@/components/ui/primitives";
const button =
  "focus-ring min-h-11 rounded-xl border border-[#dde1ea] px-4 py-2 text-sm font-bold disabled:opacity-50";
const weekDays = [
  "DOMINGO",
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
];
export function monthDays(month: string) {
  const start = new Date(`${month}-01T12:00:00Z`);
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12),
  );
  return Array.from(
    { length: end.getUTCDate() },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  );
}
export function effectiveCalendarEvent(
  rows: CalendarEvent[],
  day: string,
  user: { id: number; areaId: number | null; sedeId: number | null },
) {
  const rank: Record<string, number> = {
    GLOBAL: 0,
    SEDE: 1,
    AREA: 2,
    USUARIO: 3,
  };
  return rows
    .filter(
      (r) =>
        r.fechaInicio.slice(0, 10) <= day &&
        r.fechaFin.slice(0, 10) >= day &&
        (r.alcance === "GLOBAL" ||
          (r.alcance === "SEDE" && r.sedeId === user.sedeId) ||
          (r.alcance === "AREA" && r.areaId === user.areaId) ||
          (r.alcance === "USUARIO" && r.usuarioId === user.id)),
    )
    .sort(
      (a, b) =>
        rank[b.alcance] - rank[a.alcance] ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        b.id.localeCompare(a.id),
    )[0];
}
export function CalendarPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user, permissions.CALENDAR_READ);
  const manage = hasPermission(user, permissions.CALENDAR_MANAGE);
  const scope = permissionScope(user, permissions.CALENDAR_MANAGE);
  const [month, setMonth] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
    })
      .format(new Date())
      .slice(0, 7),
  );
  const [view, setView] = useState("month");
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<CalendarData>({ items: [], shift: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [revoke, setRevoke] = useState<CalendarEvent | null>(null);
  const [revokePreview, setRevokePreview] = useState<Preview | null>(null);
  const sequence = useRef(0);
  const days = monthDays(month);
  const load = useCallback(async () => {
    if (!allowed || !/^\d{4}-\d{2}$/.test(month)) return;
    const request = ++sequence.current;
    setLoading(true);
    try {
      const dates = monthDays(month);
      const result = await apiRequest<ApiEnvelope<CalendarData>>(
        `/api/calendar/events?from=${dates[0]}&to=${dates.at(-1)}`,
      );
      if (request === sequence.current) setData(result.data);
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [allowed, month]);
  useEffect(() => {
    void load().catch((cause) => setError(getApiErrorMessage(cause, "load")));
    return () => {
      sequence.current++;
    };
  }, [load]);
  const close = useCallback(() => {
    if (!busy) {
      setCreating(false);
      setRevoke(null);
    }
  }, [busy]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const input: Record<string, unknown> = Object.fromEntries(
      [
        "titulo",
        "motivo",
        "tipo",
        "efecto",
        "alcance",
        "fechaInicio",
        "fechaFin",
      ].map((name) => [name, form.get(name)]),
    );
    const targetFields: Record<string, string> = {
      SEDE: "sedeId",
      AREA: "areaId",
      USUARIO: "usuarioId",
    };
    if (input.alcance !== "GLOBAL")
      input[targetFields[String(input.alcance)]] = Number(form.get("target"));
    if (input.efecto === "HORARIO_ESPECIAL") {
      input.horaInicio = `${form.get("horaInicio")}:00`;
      input.horaFin = `${form.get("horaFin")}:00`;
    }
    const isPreview =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "preview";
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (isPreview)
        setPreview(
          await socialMutation<Preview>(
            user.id,
            "/api/calendar/exceptions/preview",
            input,
          ),
        );
      else {
        await socialMutation(user.id, "/api/calendar/exceptions", {
          exception: input,
          ...(preview ? { previewId: preview.previewId } : {}),
          confirmDefinitive: form.get("confirmDefinitive") === "on",
        });
        setCreating(false);
        setNotice(
          "Excepción confirmada. No se concedieron horas automáticamente.",
        );
        try {
          await load();
        } catch {
          setError("Cambio confirmado; el listado no se pudo actualizar.");
        }
      }
    } catch (cause) {
      setError(socialError(cause));
    } finally {
      setBusy(false);
    }
  }
  async function previewRevocation(row: CalendarEvent) {
    setRevoke(row);
    setRevokePreview(null);
    setBusy(true);
    setError("");
    try {
      setRevokePreview(
        await socialMutation<Preview>(
          user.id,
          `/api/calendar/exceptions/${row.id}/revoke-preview`,
          {},
        ),
      );
    } catch (cause) {
      setError(socialError(cause));
    } finally {
      setBusy(false);
    }
  }
  async function confirmRevocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revoke || !revokePreview || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await socialMutation(
        user.id,
        `/api/calendar/exceptions/${revoke.id}`,
        {
          motivo: form.get("motivo"),
          previewId: revokePreview.previewId,
          confirmDefinitive: form.get("confirmDefinitive") === "on",
        },
        "DELETE",
      );
      setRevoke(null);
      setNotice(
        "Revocación confirmada. No se reactivaron ausencias históricas.",
      );
      try {
        await load();
      } catch {
        setError("Cambio confirmado; el listado no se pudo actualizar.");
      }
    } catch (cause) {
      setError(socialError(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!allowed) return <ForbiddenState />;
  const selectedIndex = Math.max(0, days.indexOf(selected));
  const visibleDays =
    view === "week"
      ? days.slice(
          Math.floor(selectedIndex / 7) * 7,
          Math.floor(selectedIndex / 7) * 7 + 7,
        )
      : days;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Servicio Social"
        title="Calendario"
        description="Precedencia: usuario, área, sede, global y turno. Las excepciones nunca conceden horas sin validación."
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Mes">
          <input
            type="month"
            value={month}
            required
            className={inputClassName}
            onChange={(e) => {
              if (e.target.value) {
                setMonth(e.target.value);
                setSelected("");
              }
            }}
          />
        </Field>
        <button
          className={button}
          aria-pressed={view === "month"}
          onClick={() => setView("month")}
        >
          Mensual
        </button>
        <button
          className={button}
          aria-pressed={view === "week"}
          onClick={() => setView("week")}
        >
          Semanal
        </button>
        <button
          className={button}
          disabled={loading || busy}
          onClick={() =>
            void load().catch((cause) =>
              setError(getApiErrorMessage(cause, "load")),
            )
          }
        >
          Actualizar
        </button>
        {manage && (
          <button
            className={button}
            onClick={() => {
              setPreview(null);
              setError("");
              setCreating(true);
            }}
          >
            Nueva excepción
          </button>
        )}
      </div>
      {!creating && !revoke && error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
      <p role="status">{notice || (loading ? "Cargando calendario…" : "")}</p>
      {view === "week" && (
        <Field label="Día de la semana a consultar">
          <input
            type="date"
            min={days[0]}
            max={days.at(-1)}
            value={selected || days[0]}
            className={inputClassName}
            onChange={(e) => setSelected(e.target.value)}
          />
        </Field>
      )}
      <section
        aria-label="Días y obligaciones personales"
        aria-busy={loading}
        className="grid grid-cols-1 gap-2 sm:grid-cols-4 lg:grid-cols-7"
      >
        {visibleDays.map((day) => {
          const effective = effectiveCalendarEvent(data.items, day, user);
          const work = effective
            ? ["HORARIO_ESPECIAL", "ASISTENCIA_EXTRAORDINARIA"].includes(
                effective.efecto,
              )
            : data.shift?.days.includes(
                weekDays[new Date(`${day}T12:00:00Z`).getUTCDay()],
              );
          return (
            <button
              key={day}
              className={`${button} text-left ${work ? "bg-white" : "bg-slate-100"}`}
              aria-pressed={selected === day}
              onClick={() => setSelected(day)}
            >
              <time dateTime={day}>{day}</time>
              <span className="mt-2 block">
                {effective?.titulo ?? (work ? "Turno programado" : "Sin turno")}
              </span>
              <span className="block text-xs">
                {effective?.efecto.replaceAll("_", " ") ??
                  (work && data.shift
                    ? `${data.shift.start} – ${data.shift.end}`
                    : "Sin obligación de asistencia")}
              </span>
            </button>
          );
        })}
      </section>
      <Panel
        title={selected ? `Excepciones del ${selected}` : "Excepciones del mes"}
      >
        {!data.items.length && !loading && (
          <p>No hay excepciones en este mes.</p>
        )}
        <ul className="space-y-4">
          {data.items
            .filter(
              (row) =>
                !selected ||
                (row.fechaInicio.slice(0, 10) <= selected &&
                  row.fechaFin.slice(0, 10) >= selected),
            )
            .map((row) => (
              <li key={row.id} className="rounded-xl border p-4">
                <h3 className="font-bold">
                  {row.titulo} · {row.alcance}
                </h3>
                <p>
                  {row.fechaInicio.slice(0, 10)} – {row.fechaFin.slice(0, 10)}
                </p>
                <p>{row.efecto.replaceAll("_", " ")}</p>
                <p className="whitespace-pre-wrap break-words">{row.motivo}</p>
                {manage && (
                  <button
                    className={`${button} mt-2`}
                    disabled={busy}
                    onClick={() => void previewRevocation(row)}
                  >
                    Vista previa de revocación
                  </button>
                )}
              </li>
            ))}
        </ul>
      </Panel>
      <Modal
        open={creating}
        title="Nueva excepción de calendario"
        onClose={close}
        description="Los cambios de hoy o anteriores necesitan vista previa vigente; las ausencias definitivas requieren Administración."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => void create(e)}
          onChange={() => setPreview(null)}
        >
          {error && (
            <p role="alert" className="text-red-800">
              {error}
            </p>
          )}
          <Field label="Título">
            <input
              name="titulo"
              required
              minLength={3}
              maxLength={150}
              className={inputClassName}
            />
          </Field>
          <Field label="Motivo auditado">
            <textarea
              name="motivo"
              required
              minLength={5}
              maxLength={500}
              className={textareaClassName}
            />
          </Field>
          <Field label="Tipo">
            <select name="tipo" className={inputClassName}>
              {[
                "FESTIVO_OFICIAL",
                "VACACIONES_INSTITUCIONALES",
                "SUSPENSION_OPERATIVA",
                "PERMISO_INDIVIDUAL",
                "HORARIO_ESPECIAL",
                "ASISTENCIA_EXTRAORDINARIA",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Efecto">
            <select name="efecto" className={inputClassName}>
              {[
                "SUSPENSION_ACTIVIDADES",
                "PERMISO_PROGRAMADO",
                "HORARIO_ESPECIAL",
                "ASISTENCIA_EXTRAORDINARIA",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Alcance">
            <select
              name="alcance"
              className={inputClassName}
              defaultValue={
                scope === "global"
                  ? "GLOBAL"
                  : scope === "sede"
                    ? "SEDE"
                    : "AREA"
              }
            >
              {scope === "global" && <option>GLOBAL</option>}
              {scope !== "area" && <option>SEDE</option>}
              <option>AREA</option>
              <option>USUARIO</option>
            </select>
          </Field>
          <Field
            label="ID de sede, área o usuario"
            hint="No se usa para Global. El servidor comprueba pertenencia y alcance."
          >
            <input
              name="target"
              type="number"
              min={1}
              step={1}
              defaultValue={
                scope === "area"
                  ? (user.areaId ?? "")
                  : scope === "sede"
                    ? (user.sedeId ?? "")
                    : ""
              }
              className={inputClassName}
            />
          </Field>
          <Field label="Inicio">
            <input
              name="fechaInicio"
              type="date"
              required
              className={inputClassName}
            />
          </Field>
          <Field label="Fin">
            <input
              name="fechaFin"
              type="date"
              required
              className={inputClassName}
            />
          </Field>
          <Field label="Hora inicial (sólo horario especial)">
            <input
              name="horaInicio"
              type="time"
              step={60}
              className={inputClassName}
            />
          </Field>
          <Field label="Hora final (sólo horario especial)">
            <input
              name="horaFin"
              type="time"
              step={60}
              className={inputClassName}
            />
          </Field>
          {preview && <PreviewSummary preview={preview} />}
          {user.rol === "ADMIN" && (
            <label className="flex gap-3">
              <input
                name="confirmDefinitive"
                type="checkbox"
                onChange={(e) => e.stopPropagation()}
              />
              Confirmo explícitamente el impacto sobre ausencias definitivas.
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="action"
              value="preview"
              disabled={busy}
              className={button}
            >
              Calcular vista previa
            </button>
            <button
              type="submit"
              name="action"
              value="create"
              disabled={busy}
              className={button}
            >
              Crear excepción
            </button>
          </div>
        </form>
      </Modal>
      <Modal open={!!revoke} title="Revocar excepción" onClose={close}>
        {error && (
          <p role="alert" className="text-red-800">
            {error}
          </p>
        )}
        {revokePreview ? (
          <form
            className="space-y-4"
            onSubmit={(e) => void confirmRevocation(e)}
          >
            <PreviewSummary preview={revokePreview} />
            <p>No se reactivan ausencias históricas.</p>
            <Field label="Motivo de revocación">
              <textarea
                name="motivo"
                required
                minLength={5}
                maxLength={500}
                className={textareaClassName}
              />
            </Field>
            {user.rol === "ADMIN" && (
              <label className="flex gap-3">
                <input type="checkbox" name="confirmDefinitive" />
                Confirmo el impacto sobre registros definitivos.
              </label>
            )}
            <FormActions
              saving={busy}
              submitLabel="Confirmar revocación"
              onCancel={close}
            />
          </form>
        ) : (
          <p role="status">
            {busy ? "Calculando impacto…" : "No hay vista previa válida."}
          </p>
        )}
      </Modal>
    </div>
  );
}
function PreviewSummary({ preview }: { preview: Preview }) {
  return (
    <div role="status" className="rounded-xl border bg-slate-50 p-4">
      <p>
        Impacto: {preview.users} usuarios, {preview.attendances} asistencias,{" "}
        {preview.absences} ausencias ({preview.definitive} definitivas).
      </p>
      <p>
        Vence:{" "}
        {new Date(preview.expiresAt).toLocaleString("es-MX", {
          timeZone: "America/Mexico_City",
        })}
        . Las horas no cambian.
      </p>
    </div>
  );
}
