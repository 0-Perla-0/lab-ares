"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Ban,
  Box,
  Download,
  Play,
  RefreshCw,
  UserRoundCog,
} from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { FileUploadField } from "@/components/backend2/file-upload-field";
import {
  EmptyState,
  ErrorBanner,
  Field,
  ForbiddenState,
  LoadError,
  LoadingTable,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  StatusBadge,
  inputClassName,
  textareaClassName,
  type StatusTone,
} from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
import {
  isPrinting3dDisabled,
  printing3dApi,
  printingStates,
  type PrintingJob,
  type PrintingPage as PrintingPageResult,
  type PrintingState,
} from "@/lib/backend2/printing-3d";
import { hasPermission, permissions } from "@/lib/permissions";

const tone: Record<PrintingState, StatusTone> = {
  SOLICITADO: "warning",
  EN_REVISION: "info",
  APROBADO: "success",
  EN_COLA: "info",
  EN_IMPRESION: "info",
  COMPLETADO: "success",
  RECHAZADO: "danger",
  CANCELADO: "neutral",
  FALLIDO: "danger",
};

export function Printing3dPage() {
  const { user } = useAuth();
  const canRequest = hasPermission(user, permissions.PRINTING_3D_REQUEST);
  const canOperate = hasPermission(user, permissions.PRINTING_3D_OPERATE);
  const canManage = hasPermission(user, permissions.PRINTING_3D_MANAGE);
  const [pageNumber, setPageNumber] = useState(1);
  const [status, setStatus] = useState<PrintingState | "">("");
  const [page, setPage] = useState<PrintingPageResult | null>(null);
  const [selected, setSelected] = useState<PrintingJob | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ archivoId: "", descripcion: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!canRequest) return;
    setLoading(true);
    setError("");
    try {
      setPage(await printing3dApi.list(pageNumber, status));
      setDisabled(false);
    } catch (requestError) {
      if (isPrinting3dDisabled(requestError)) setDisabled(true);
      else setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }, [canRequest, pageNumber, status]);

  useEffect(() => void load(), [load]);

  async function refreshDetail(id: string) {
    setSelected(await printing3dApi.detail(id));
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!draft.archivoId) {
      setError("Espera a que el STL quede disponible después del análisis.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await printing3dApi.create(user.id, draft);
      setDraft({ archivoId: "", descripcion: "" });
      setShowCreate(false);
      setNotice("Solicitud de impresión creada.");
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setBusy(false);
    }
  }

  async function act(work: () => Promise<unknown>, message: string) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await work();
      setNotice(message);
      await refreshDetail(selected.id);
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setBusy(false);
    }
  }

  function reason(prompt: string) {
    const value = window.prompt(prompt)?.trim();
    return value || null;
  }

  async function download() {
    if (!selected) return;
    try {
      const url = await printing3dApi.download(selected.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    }
  }

  if (!canRequest) return <ForbiddenState />;
  if (loading && !page && !disabled) return <LoadingTable />;
  if (error && !page)
    return <LoadError message={error} onRetry={() => void load()} />;
  if (disabled) return <DisabledState onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fabricación"
        title="Impresión 3D"
        description="Solicita trabajos STL privados y consulta cada revisión, asignación y ejecución."
        action={{
          label: "Nueva solicitud",
          onClick: () => setShowCreate(true),
        }}
      />
      <ErrorBanner message={error} />
      {notice && (
        <p
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"
        >
          {notice}
        </p>
      )}
      <Panel
        title="Trabajos"
        description="Los estados y acciones disponibles provienen del flujo autorizado."
      >
        <div className="mb-5 max-w-xs">
          <Field label="Estado">
            <select
              className={inputClassName}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as PrintingState | "");
                setPageNumber(1);
              }}
            >
              <option value="">Todos</option>
              {printingStates.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        </div>
        {page?.items.length ? (
          <div role="list" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {page.items.map((job) => (
              <button
                role="listitem"
                key={job.id}
                type="button"
                onClick={() => void refreshDetail(job.id)}
                className="focus-ring min-h-40 rounded-2xl border border-[var(--ares-border)] p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <Box className="text-[#769a27]" />
                  <StatusBadge
                    label={job.estado.replaceAll("_", " ")}
                    tone={tone[job.estado]}
                  />
                </div>
                <h2 className="mt-3 line-clamp-2 font-black">
                  {job.descripcion}
                </h2>
                <p className="mt-2 text-sm text-[var(--ares-muted)]">
                  {job.archivo.originalName}
                </p>
                <p className="mt-1 text-xs font-bold text-[var(--ares-muted)]">
                  Solicita {job.solicitante.codigo}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sin trabajos"
            description="No hay solicitudes visibles con este filtro."
          />
        )}
        {page && (
          <div className="mt-5">
            <Pagination
              page={page.page}
              pageSize={page.pageSize}
              total={page.total}
              disabled={loading}
              onPageChange={setPageNumber}
            />
          </div>
        )}
      </Panel>

      <Modal
        open={showCreate}
        title="Nueva solicitud 3D"
        description="El archivo debe ser STL y superar el análisis privado antes de asociarse."
        onClose={() => !busy && setShowCreate(false)}
      >
        <form onSubmit={create} className="space-y-4">
          <FileUploadField
            label="Modelo STL"
            accept=".stl,model/stl"
            required
            disabled={busy}
            onFileReady={(archivoId) =>
              setDraft((old) => ({ ...old, archivoId }))
            }
          />
          <Field label="Descripción" required>
            <textarea
              className={textareaClassName}
              required
              minLength={1}
              maxLength={2000}
              value={draft.descripcion}
              onChange={(event) =>
                setDraft((old) => ({ ...old, descripcion: event.target.value }))
              }
            />
          </Field>
          <button
            disabled={busy || !draft.archivoId}
            className="focus-ring min-h-11 w-full rounded-xl bg-[#12221b] px-5 text-sm font-black text-white disabled:opacity-50"
          >
            {busy ? "Enviando…" : "Crear solicitud"}
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(selected)}
        title={selected ? `Trabajo ${selected.id}` : "Trabajo"}
        onClose={() => !busy && setSelected(null)}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge
                label={selected.estado.replaceAll("_", " ")}
                tone={tone[selected.estado]}
              />
              <button
                type="button"
                onClick={() => void download()}
                className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--ares-border-strong)] px-4 text-sm font-black"
              >
                <Download size={16} /> Descargar STL
              </button>
            </div>
            <p className="whitespace-pre-line text-sm leading-6">
              {selected.descripcion}
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Info label="Solicitante" value={selected.solicitante.codigo} />
              <Info
                label="Operador"
                value={selected.operadorAsignado?.codigo ?? "Sin asignar"}
              />
            </dl>
            <div className="flex flex-wrap gap-2">
              {canManage && selected.estado === "SOLICITADO" && (
                <Action
                  label="Iniciar revisión"
                  onClick={() =>
                    void act(
                      () =>
                        printing3dApi.review(user.id, selected.id, {
                          decision: "START",
                        }),
                      "Revisión iniciada.",
                    )
                  }
                />
              )}
              {canManage && selected.estado === "EN_REVISION" && (
                <>
                  <Action
                    label="Aprobar"
                    onClick={() =>
                      void act(
                        () =>
                          printing3dApi.review(user.id, selected.id, {
                            decision: "APPROVE",
                          }),
                        "Trabajo aprobado.",
                      )
                    }
                  />
                  <Action
                    danger
                    label="Rechazar"
                    onClick={() => {
                      const motivo = reason("Motivo del rechazo");
                      if (motivo)
                        void act(
                          () =>
                            printing3dApi.review(user.id, selected.id, {
                              decision: "REJECT",
                              motivo,
                            }),
                          "Trabajo rechazado.",
                        );
                    }}
                  />
                </>
              )}
              {canManage && selected.estado === "APROBADO" && (
                <Action
                  icon={<UserRoundCog size={16} />}
                  label="Asignar operador"
                  onClick={() => {
                    const raw = window.prompt("ID numérico del operador");
                    const operadorId = Number(raw);
                    if (Number.isInteger(operadorId) && operadorId > 0)
                      void act(
                        () =>
                          printing3dApi.assign(
                            user.id,
                            selected.id,
                            operadorId,
                          ),
                        "Operador asignado.",
                      );
                  }}
                />
              )}
              {canOperate && selected.estado === "EN_COLA" && (
                <Action
                  icon={<Play size={16} />}
                  label="Iniciar impresión"
                  onClick={() => {
                    const material = reason("Material utilizado");
                    if (material)
                      void act(
                        () =>
                          printing3dApi.start(user.id, selected.id, material),
                        "Impresión iniciada.",
                      );
                  }}
                />
              )}
              {canOperate && selected.estado === "EN_IMPRESION" && (
                <>
                  <Action
                    label="Completar"
                    onClick={() => {
                      const grams = Number(
                        window.prompt("Peso en gramos (opcional)") || "",
                      );
                      void act(
                        () =>
                          printing3dApi.finish(
                            user.id,
                            selected.id,
                            selected.ejecuciones.at(-1)!.id,
                            {
                              resultado: "COMPLETADA",
                              ...(grams > 0 ? { pesoGramos: grams } : {}),
                            },
                          ),
                        "Impresión completada.",
                      );
                    }}
                  />
                  <Action
                    danger
                    label="Marcar fallida"
                    onClick={() => {
                      const observacion = reason("Describe la falla");
                      if (observacion)
                        void act(
                          () =>
                            printing3dApi.finish(
                              user.id,
                              selected.id,
                              selected.ejecuciones.at(-1)!.id,
                              { resultado: "FALLIDA", observacion },
                            ),
                          "Falla registrada.",
                        );
                    }}
                  />
                </>
              )}
              {canOperate && selected.estado === "FALLIDO" && (
                <Action
                  icon={<RefreshCw size={16} />}
                  label="Reintentar"
                  onClick={() => {
                    const motivo = reason("Motivo del reintento");
                    if (motivo)
                      void act(
                        () => printing3dApi.retry(user.id, selected.id, motivo),
                        "Trabajo devuelto a cola.",
                      );
                  }}
                />
              )}
              {!["COMPLETADO", "RECHAZADO", "CANCELADO"].includes(
                selected.estado,
              ) && (
                <Action
                  danger
                  icon={<Ban size={16} />}
                  label="Cancelar"
                  onClick={() => {
                    const motivo = reason("Motivo de cancelación");
                    if (motivo && window.confirm("¿Cancelar este trabajo?"))
                      void act(
                        () =>
                          printing3dApi.cancel(user.id, selected.id, motivo),
                        "Trabajo cancelado.",
                      );
                  }}
                />
              )}
            </div>
            <Panel title={`Ejecuciones (${selected.ejecuciones.length})`}>
              {selected.ejecuciones.length ? (
                <div className="space-y-3">
                  {selected.ejecuciones.map((execution) => (
                    <article
                      key={execution.id}
                      className="rounded-xl bg-[#f4f0e7] p-3 text-sm"
                    >
                      <p className="font-black">
                        Intento {execution.numero} · {execution.material}
                      </p>
                      <p className="mt-1 text-[var(--ares-muted)]">
                        {execution.resultado ?? "EN CURSO"}
                        {execution.pesoGramos
                          ? ` · ${execution.pesoGramos} g`
                          : ""}
                      </p>
                      {execution.observacion && (
                        <p className="mt-2">{execution.observacion}</p>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Sin ejecuciones"
                  description="La ejecución aparece al iniciar la impresión."
                />
              )}
            </Panel>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Action({
  label,
  onClick,
  danger = false,
  icon,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-black ${danger ? "bg-red-700 text-white" : "bg-[#12221b] text-white"}`}
    >
      {icon}
      {label}
    </button>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f4f0e7] p-3">
      <dt className="text-xs font-black uppercase text-[var(--ares-muted)]">
        {label}
      </dt>
      <dd className="mt-1 font-bold">{value}</dd>
    </div>
  );
}
function DisabledState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid min-h-[55vh] place-items-center text-center">
      <div className="max-w-md">
        <Box size={36} className="mx-auto text-[#769a27]" />
        <h1 className="mt-4 text-3xl font-black">Impresión 3D no disponible</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--ares-muted)]">
          El módulo está deshabilitado por configuración. El resto de Ares
          continúa disponible.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="focus-ring mt-5 min-h-11 rounded-xl bg-[#12221b] px-5 text-sm font-black text-white"
        >
          Volver a consultar
        </button>
      </div>
    </div>
  );
}
