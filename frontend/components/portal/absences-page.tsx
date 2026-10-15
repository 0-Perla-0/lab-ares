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
import { hasPermission, permissions } from "@/lib/permissions";
import {
  socialError,
  socialMutation,
  type Absence,
} from "@/lib/service-social";
import type { ApiEnvelope } from "@/lib/types";
import {
  Field,
  ForbiddenState,
  FormActions,
  Modal,
  PageHeader,
  Panel,
  StatusBadge,
  inputClassName,
  textareaClassName,
} from "@/components/ui/primitives";
const button =
  "focus-ring min-h-11 rounded-xl border border-[#dde1ea] px-4 py-2 text-sm font-bold disabled:opacity-50";
const titles = {
  justify: "Enviar justificación",
  appeal: "Presentar apelación",
  resolve: "Resolver justificación",
  "resolve-appeal": "Resolver apelación",
};
type Action = keyof typeof titles;
const formatDate = (date: string) =>
  new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
export function AbsencesPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user, permissions.ABSENCES_SELF);
  const review = hasPermission(user, permissions.ABSENCES_REVIEW);
  const appealReview = hasPermission(user, permissions.ABSENCES_APPEAL_RESOLVE);
  const [mode, setMode] = useState("me");
  const [rows, setRows] = useState<Absence[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState<{ row: Absence; action: Action } | null>(
    null,
  );
  const [file, setFile] = useState<{ id: string; status: string } | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [expectsEvidence, setExpectsEvidence] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    if (!allowed) return;
    const current = ++request.current;
    setLoading(true);
    try {
      const result = await apiRequest<
        ApiEnvelope<{ items: Absence[]; nextCursor: string | null }>
      >(`/api/absences/${mode}?limit=20${cursor ? `&cursor=${cursor}` : ""}`);
      if (current === request.current) {
        setRows(result.data.items);
        setNext(result.data.nextCursor);
      }
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [allowed, mode, cursor]);
  useEffect(() => {
    void load().catch((cause) => setError(getApiErrorMessage(cause, "load")));
    return () => {
      request.current++;
    };
  }, [load]);
  function open(row: Absence, action: Action) {
    setActive({ row, action });
    setFile(null);
    setExpectsEvidence(false);
    setError("");
  }
  const close = useCallback(() => {
    if (!busy && !fileBusy) setActive(null);
  }, [busy, fileBusy]);
  async function upload(selected?: File) {
    if (!selected) return;
    setExpectsEvidence(true);
    if (
      selected.size > 10 * 1024 * 1024 ||
      !["application/pdf", "image/jpeg", "image/png"].includes(selected.type)
    ) {
      setError("Usa un PDF/JPG/PNG de hasta 10 MiB.");
      return;
    }
    setFileBusy(true);
    setError("");
    setFile(null);
    try {
      const body = new FormData();
      body.set("file", selected);
      const result = await apiRequest<
        ApiEnvelope<{ id: string; status: string }>
      >("/api/files", { method: "POST", body });
      setFile(result.data);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setFileBusy(false);
    }
  }
  async function scan() {
    if (!file) return;
    setFileBusy(true);
    try {
      const result = await apiRequest<
        ApiEnvelope<{ id: string; status: string }>
      >(`/api/files/${file.id}`);
      setFile(result.data);
    } catch (cause) {
      setError(getApiErrorMessage(cause, "load"));
    } finally {
      setFileBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !active ||
      busy ||
      fileBusy ||
      (expectsEvidence && file?.status !== "DISPONIBLE")
    )
      return;
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { version: active.row.version };
    if (active.action === "justify" || active.action === "appeal") {
      body[active.action === "appeal" ? "argumento" : "motivo"] =
        form.get("motivo");
      if (file) body.archivoId = file.id;
    } else {
      body.decision = form.get("decision");
      body.motivo = form.get("motivo");
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await socialMutation(
        user.id,
        `/api/absences/${active.row.id}/${active.action}`,
        body,
      );
      setActive(null);
      setNotice("Operación confirmada por el servidor.");
      try {
        await load();
      } catch {
        setError(
          "La operación fue confirmada, pero no se pudo actualizar el listado. Usa Actualizar.",
        );
      }
    } catch (cause) {
      setError(socialError(cause));
    } finally {
      setBusy(false);
    }
  }
  async function download(row: Absence, archivoId: string) {
    try {
      const result = await apiRequest<ApiEnvelope<string>>(
        `/api/absences/${row.id}/evidence/${archivoId}/download`,
      );
      window.location.assign(result.data);
    } catch (cause) {
      setError(getApiErrorMessage(cause, "load"));
    }
  }
  if (!allowed) return <ForbiddenState />;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Servicio Social"
        title="Ausencias y justificaciones"
        description="Las faltas son provisionales. Tienes 5 días hábiles para justificar, 2 para aclarar y 3 para apelar un rechazo."
      />
      <nav aria-label="Bandejas de ausencias" className="flex flex-wrap gap-2">
        <button
          className={button}
          aria-pressed={mode === "me"}
          disabled={busy}
          onClick={() => {
            setMode("me");
            setCursor(null);
          }}
        >
          Mis ausencias
        </button>
        {review && (
          <button
            className={button}
            aria-pressed={mode === "queue"}
            disabled={busy}
            onClick={() => {
              setMode("queue");
              setCursor(null);
            }}
          >
            Bandeja de revisión
          </button>
        )}
        <button
          className={button}
          disabled={loading || busy}
          onClick={() => {
            setError("");
            void load().catch((cause) =>
              setError(getApiErrorMessage(cause, "load")),
            );
          }}
        >
          Actualizar
        </button>
      </nav>
      {!active && error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
      <p role="status">{notice || (loading ? "Cargando ausencias…" : "")}</p>
      {!loading && !rows.length && <p>No hay ausencias en esta bandeja.</p>}
      <div aria-busy={loading} className="space-y-4">
        {rows.map((row) => (
          <Panel
            key={row.id}
            title={`${row.fecha.slice(0, 10)} · ${row.user.codigo}`}
          >
            <StatusBadge
              label={row.estado.replaceAll("_", " ")}
              tone={row.estado === "JUSTIFICADA" ? "success" : "neutral"}
            />
            {row.businessDaysRemaining !== null && (
              <p className="mt-3">
                Días hábiles restantes: {row.businessDaysRemaining}
              </p>
            )}
            <p className="mt-2 text-sm">
              Plazo inicial: {formatDate(row.plazoLimiteAt)}
            </p>
            {row.aclaracionLimiteAt && (
              <p>Plazo de aclaración: {formatDate(row.aclaracionLimiteAt)}</p>
            )}
            {row.apelacionLimiteAt && (
              <p>Plazo de apelación: {formatDate(row.apelacionLimiteAt)}</p>
            )}
            {row.motivoResolucion && (
              <p className="mt-2 whitespace-pre-wrap break-words">
                Resolución: {row.motivoResolucion}
              </p>
            )}
            <details className="mt-3">
              <summary className="focus-ring cursor-pointer py-3 font-bold">
                Escritos y soportes privados
              </summary>
              {row.justificaciones.map((j) => (
                <div key={j.id} className="my-3">
                  <p className="whitespace-pre-wrap break-words">{j.motivo}</p>
                  {j.archivoId && (
                    <button
                      className={button}
                      onClick={() => void download(row, j.archivoId!)}
                    >
                      Descargar soporte de justificación
                    </button>
                  )}
                </div>
              ))}
              {row.apelacion && (
                <div>
                  <p className="whitespace-pre-wrap break-words">
                    Apelación: {row.apelacion.argumento}
                  </p>
                  {row.apelacion.archivoId && (
                    <button
                      className={button}
                      onClick={() =>
                        void download(row, row.apelacion!.archivoId!)
                      }
                    >
                      Descargar soporte de apelación
                    </button>
                  )}
                  {row.apelacion.resolucion && (
                    <p>Resolución final: {row.apelacion.resolucion}</p>
                  )}
                </div>
              )}
            </details>
            <div className="mt-3 flex flex-wrap gap-2">
              {row.userId === user.id &&
                ["PENDIENTE_JUSTIFICACION", "EN_ACLARACION"].includes(
                  row.estado,
                ) && (
                  <button
                    className={button}
                    onClick={() => open(row, "justify")}
                  >
                    Justificar / aclarar
                  </button>
                )}
              {row.userId === user.id &&
                row.estado === "NO_JUSTIFICADA" &&
                !row.apelacion && (
                  <button
                    className={button}
                    onClick={() => open(row, "appeal")}
                  >
                    Apelar
                  </button>
                )}
              {review &&
                row.userId !== user.id &&
                row.estado === "JUSTIFICACION_ENVIADA" && (
                  <button
                    className={button}
                    onClick={() => open(row, "resolve")}
                  >
                    Resolver
                  </button>
                )}
              {appealReview &&
                row.userId !== user.id &&
                row.resueltoPorId !== user.id &&
                row.estado === "EN_APELACION" && (
                  <button
                    className={button}
                    onClick={() => open(row, "resolve-appeal")}
                  >
                    Resolver apelación
                  </button>
                )}
            </div>
          </Panel>
        ))}
      </div>
      <nav aria-label="Paginación de ausencias" className="flex gap-2">
        <button
          className={button}
          disabled={!cursor || loading}
          onClick={() => setCursor(null)}
        >
          Primera página
        </button>
        <button
          className={button}
          disabled={!next || loading}
          onClick={() => setCursor(next)}
        >
          Siguiente
        </button>
      </nav>
      <Modal
        open={!!active}
        title={active ? titles[active.action] : "Ausencia"}
        onClose={close}
        description="No incluyas información médica innecesaria. Los soportes son privados."
      >
        {active && (
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            {error && (
              <p role="alert" className="text-red-800">
                {error}
              </p>
            )}
            {["resolve", "resolve-appeal"].includes(active.action) && (
              <Field label="Decisión">
                <select name="decision" className={inputClassName}>
                  <option value="JUSTIFICADA">Aceptar</option>
                  {active.action === "resolve" && (
                    <option value="EN_ACLARACION">Solicitar aclaración</option>
                  )}
                  <option value="NO_JUSTIFICADA">Rechazar</option>
                </select>
              </Field>
            )}
            <Field
              label={active.action === "appeal" ? "Argumento" : "Motivo"}
              required
            >
              <textarea
                name="motivo"
                className={textareaClassName}
                required
                minLength={5}
                maxLength={
                  ["resolve", "resolve-appeal"].includes(active.action)
                    ? 1000
                    : 2000
                }
              />
            </Field>
            {["justify", "appeal"].includes(active.action) && (
              <>
                <Field
                  label="Soporte opcional"
                  hint="PDF/JPG/PNG, máximo 10 MiB; se requiere análisis limpio."
                >
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={busy || fileBusy}
                    className={inputClassName}
                    onChange={(event) => void upload(event.target.files?.[0])}
                  />
                </Field>
                <p role="status">
                  {fileBusy
                    ? "Procesando soporte…"
                    : file
                      ? `Estado del soporte: ${file.status}`
                      : "Sin soporte adjunto."}
                </p>
                {expectsEvidence && (
                  <div className="flex flex-wrap gap-2">
                    {file && (
                      <button
                        type="button"
                        className={button}
                        disabled={fileBusy || busy}
                        onClick={() => void scan()}
                      >
                        Revisar análisis
                      </button>
                    )}
                    <button
                      type="button"
                      className={button}
                      disabled={fileBusy || busy}
                      onClick={() => {
                        setFile(null);
                        setExpectsEvidence(false);
                      }}
                    >
                      Enviar sin soporte
                    </button>
                  </div>
                )}
              </>
            )}
            <FormActions
              saving={
                busy ||
                fileBusy ||
                (expectsEvidence && file?.status !== "DISPONIBLE")
              }
              submitLabel="Enviar al servidor"
              onCancel={close}
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
