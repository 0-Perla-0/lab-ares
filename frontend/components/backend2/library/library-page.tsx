"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Archive,
  CheckCircle2,
  Download,
  FilePlus2,
  Send,
  ShieldCheck,
} from "lucide-react";

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
} from "@/components/ui/primitives";
import { useAuth } from "@/components/auth/auth-provider";
import { getApiErrorMessage } from "@/lib/api";
import {
  libraryApi,
  libraryCategories,
  libraryScopes,
  libraryStates,
  type LibraryCreateInput,
  type LibraryDocument,
  type LibraryPage as LibraryPageResult,
  type LibraryState,
  type LibraryVersionInput,
} from "@/lib/backend2/library";
import { hasPermission, permissions } from "@/lib/permissions";

const tones: Record<LibraryState, "neutral" | "info" | "success" | "warning"> =
  {
    BORRADOR: "neutral",
    EN_REVISION: "info",
    PUBLICADO: "success",
    ARCHIVADO: "warning",
  };
const label = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (x) => x.toUpperCase());

const emptyDraft: LibraryCreateInput = {
  titulo: "",
  descripcion: "",
  categoria: "MANUAL",
  alcance: "GLOBAL",
  requiereAcuse: false,
  archivoId: "",
  resumenCambios: "",
};

export function LibraryPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user, permissions.LIBRARY_READ);
  const canDraft = hasPermission(user, permissions.LIBRARY_DRAFT_CREATE);
  const canReview = hasPermission(user, permissions.LIBRARY_REVIEW);
  const canPublish = hasPermission(user, permissions.LIBRARY_PUBLISH);
  const canArchive = hasPermission(user, permissions.LIBRARY_ARCHIVE);
  const canAck = hasPermission(user, permissions.LIBRARY_ACKNOWLEDGE);
  const [pageNumber, setPageNumber] = useState(1);
  const [filters, setFilters] = useState({
    q: "",
    estado: "",
    categoria: "",
    alcance: "",
  });
  const [page, setPage] = useState<LibraryPageResult | null>(null);
  const [selected, setSelected] = useState<LibraryDocument | null>(null);
  const [draft, setDraft] = useState<LibraryCreateInput>(emptyDraft);
  const [showCreate, setShowCreate] = useState(false);
  const [versionDocument, setVersionDocument] =
    useState<LibraryDocument | null>(null);
  const [versionDraft, setVersionDraft] = useState<LibraryVersionInput>({
    archivoId: "",
    resumenCambios: "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      setPage(
        await libraryApi.list({
          page: pageNumber,
          q: filters.q,
          estado: filters.estado as LibraryState | "",
          categoria: filters.categoria as never,
          alcance: filters.alcance as never,
        }),
      );
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }, [canRead, filters, pageNumber]);

  useEffect(() => void load(), [load]);
  if (!canRead) return <ForbiddenState />;
  if (loading && !page) return <LoadingTable />;
  if (error && !page)
    return <LoadError message={error} onRetry={() => void load()} />;

  async function detail(id: string) {
    setBusy(true);
    setError("");
    try {
      setSelected(await libraryApi.detail(id));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!draft.archivoId)
      return setError("Espera a que el archivo quede disponible.");
    setBusy(true);
    setError("");
    try {
      await libraryApi.create(draft);
      setDraft(emptyDraft);
      setShowCreate(false);
      setNotice("Documento creado como borrador.");
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setBusy(false);
    }
  }

  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(success);
      if (selected) setSelected(await libraryApi.detail(selected.id));
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setBusy(false);
    }
  }

  async function createVersion(event: FormEvent) {
    event.preventDefault();
    if (!versionDocument || !versionDraft.archivoId) {
      setError("Espera a que el archivo quede disponible.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await libraryApi.createVersion(versionDocument.id, versionDraft);
      setNotice("Nueva versión creada como borrador.");
      setVersionDraft({ archivoId: "", resumenCambios: "" });
      setVersionDocument(null);
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Conocimiento institucional"
        title="Biblioteca versionada"
        description="Consulta documentos vigentes y administra su revisión, publicación y acuse sin perder el historial."
        action={
          canDraft
            ? { label: "Nuevo documento", onClick: () => setShowCreate(true) }
            : undefined
        }
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
      <Panel title="Filtros">
        <form
          className="grid gap-3 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            setPageNumber(1);
            void load();
          }}
        >
          <Field label="Buscar">
            <input
              className={inputClassName}
              value={filters.q}
              onChange={(event) =>
                setFilters((old) => ({ ...old, q: event.target.value }))
              }
            />
          </Field>
          <Field label="Estado">
            <select
              className={inputClassName}
              value={filters.estado}
              onChange={(event) =>
                setFilters((old) => ({ ...old, estado: event.target.value }))
              }
            >
              <option value="">Todos</option>
              {libraryStates.map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoría">
            <select
              className={inputClassName}
              value={filters.categoria}
              onChange={(event) =>
                setFilters((old) => ({ ...old, categoria: event.target.value }))
              }
            >
              <option value="">Todas</option>
              {libraryCategories.map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Alcance">
            <select
              className={inputClassName}
              value={filters.alcance}
              onChange={(event) =>
                setFilters((old) => ({ ...old, alcance: event.target.value }))
              }
            >
              <option value="">Todos</option>
              {libraryScopes.map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </Field>
          <button className="focus-ring min-h-11 self-end rounded-xl bg-[#12221b] px-4 text-sm font-black text-white">
            Aplicar filtros
          </button>
        </form>
      </Panel>
      <Panel title={`Documentos (${page?.total ?? 0})`}>
        {page?.items.length ? (
          <div className="grid gap-3 lg:grid-cols-2" role="list">
            {page.items.map((document) => (
              <button
                key={document.id}
                role="listitem"
                type="button"
                onClick={() => void detail(document.id)}
                className="focus-ring min-h-24 rounded-2xl border border-[var(--ares-border)] p-4 text-left hover:border-[#769a27]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-black">{document.titulo}</h2>
                  <StatusBadge
                    label={label(document.estado)}
                    tone={tones[document.estado]}
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--ares-muted)]">
                  {document.descripcion || "Sin descripción"}
                </p>
                <p className="mt-3 text-xs font-extrabold uppercase tracking-wide text-[#769a27]">
                  {label(document.categoria)} · {label(document.alcance)}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No hay documentos"
            description="Ajusta los filtros o crea el primer borrador."
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
        title="Nuevo documento"
        description="El archivo debe terminar el análisis en estado DISPONIBLE."
        onClose={() => !busy && setShowCreate(false)}
      >
        <form onSubmit={create} className="space-y-4">
          <Field label="Título" required>
            <input
              className={inputClassName}
              required
              maxLength={191}
              value={draft.titulo}
              onChange={(e) =>
                setDraft((old) => ({ ...old, titulo: e.target.value }))
              }
            />
          </Field>
          <Field label="Descripción">
            <textarea
              className={textareaClassName}
              value={draft.descripcion}
              onChange={(e) =>
                setDraft((old) => ({ ...old, descripcion: e.target.value }))
              }
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoría">
              <select
                className={inputClassName}
                value={draft.categoria}
                onChange={(e) =>
                  setDraft((old) => ({
                    ...old,
                    categoria: e.target.value as never,
                  }))
                }
              >
                {libraryCategories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Alcance">
              <select
                className={inputClassName}
                value={draft.alcance}
                onChange={(e) =>
                  setDraft((old) => ({
                    ...old,
                    alcance: e.target.value as never,
                  }))
                }
              >
                {libraryScopes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
          </div>
          {draft.alcance === "SEDE" || draft.alcance === "AREA" ? (
            <Field label="ID de sede" required>
              <input
                type="number"
                min="1"
                className={inputClassName}
                onChange={(e) =>
                  setDraft((old) => ({
                    ...old,
                    sedeId: Number(e.target.value) || undefined,
                  }))
                }
              />
            </Field>
          ) : null}
          {draft.alcance === "AREA" && (
            <Field label="ID de área" required>
              <input
                type="number"
                min="1"
                className={inputClassName}
                onChange={(e) =>
                  setDraft((old) => ({
                    ...old,
                    areaId: Number(e.target.value) || undefined,
                  }))
                }
              />
            </Field>
          )}
          {draft.alcance === "PROYECTO" && (
            <Field label="ID de proyecto" required>
              <input
                className={inputClassName}
                onChange={(e) =>
                  setDraft((old) => ({ ...old, proyectoId: e.target.value }))
                }
              />
            </Field>
          )}
          <FieldUploadField
            label="Documento"
            required
            onFileReady={(archivoId) =>
              setDraft((old) => ({ ...old, archivoId }))
            }
          />
          <Field label="Resumen de cambios" required>
            <textarea
              className={textareaClassName}
              required
              value={draft.resumenCambios}
              onChange={(e) =>
                setDraft((old) => ({ ...old, resumenCambios: e.target.value }))
              }
            />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={draft.requiereAcuse}
              onChange={(e) =>
                setDraft((old) => ({ ...old, requiereAcuse: e.target.checked }))
              }
            />{" "}
            Requiere acuse de lectura
          </label>
          <button
            disabled={busy || !draft.archivoId}
            className="focus-ring min-h-11 w-full rounded-xl bg-[#12221b] px-5 text-sm font-black text-white disabled:opacity-50"
          >
            {busy ? "Creando…" : "Crear borrador"}
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(selected)}
        title={selected?.titulo ?? "Documento"}
        description="Historial y acciones disponibles"
        onClose={() => !busy && setSelected(null)}
      >
        {selected && (
          <div className="space-y-4">
            {canDraft && selected.estado !== "ARCHIVADO" && (
              <button
                type="button"
                onClick={() => {
                  setVersionDocument(selected);
                  setSelected(null);
                }}
                className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#12221b] px-4 text-sm font-black text-white"
              >
                <FilePlus2 size={16} /> Nueva versión
              </button>
            )}
            {selected.versiones.map((version) => (
              <article
                key={version.id}
                className="rounded-2xl border border-[var(--ares-border)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-black">Versión {version.numero}</h3>
                  <StatusBadge
                    label={label(version.estado)}
                    tone={tones[version.estado]}
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--ares-muted)]">
                  {version.resumenCambios}
                </p>
                {version.retroalimentacion && (
                  <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                    {version.retroalimentacion}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void action(async () => {
                        const url = await libraryApi.download(version.id);
                        window.open(url, "_blank", "noopener,noreferrer");
                      }, "Descarga autorizada.")
                    }
                    className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--ares-border-strong)] px-3 text-sm font-black"
                  >
                    <Download size={16} /> Descargar
                  </button>
                  {canDraft && version.estado === "BORRADOR" && (
                    <button
                      type="button"
                      onClick={() =>
                        void action(
                          () => libraryApi.submitReview(version.id),
                          "Versión enviada a revisión.",
                        )
                      }
                      className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#12221b] px-3 text-sm font-black text-white"
                    >
                      <Send size={16} /> Enviar a revisión
                    </button>
                  )}
                  {canReview && version.estado === "EN_REVISION" && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          void action(
                            () =>
                              libraryApi.review(version.id, {
                                decision: "APPROVE",
                              }),
                            "Revisión aprobada.",
                          )
                        }
                        className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-3 text-sm font-black text-white"
                      >
                        <CheckCircle2 size={16} /> Aprobar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const retroalimentacion = window.prompt(
                            "Describe los cambios requeridos",
                          );
                          if (retroalimentacion)
                            void action(
                              () =>
                                libraryApi.review(version.id, {
                                  decision: "REQUEST_CHANGES",
                                  retroalimentacion,
                                }),
                              "Se solicitaron cambios.",
                            );
                        }}
                        className="focus-ring min-h-11 rounded-xl border border-amber-300 px-3 text-sm font-black"
                      >
                        Solicitar cambios
                      </button>
                    </>
                  )}
                  {canPublish &&
                    version.estado === "EN_REVISION" &&
                    version.revisadoPorId && (
                      <button
                        type="button"
                        onClick={() => {
                          const replacesPublished = selected.versiones.some(
                            (item) =>
                              item.id !== version.id &&
                              item.estado === "PUBLICADO",
                          );
                          const motivo = replacesPublished
                            ? window
                                .prompt(
                                  "Motivo de sustitución de la versión vigente",
                                )
                                ?.trim()
                            : undefined;
                          if (replacesPublished && !motivo) return;
                          void action(
                            () => libraryApi.publish(version.id, motivo),
                            "Versión publicada.",
                          );
                        }}
                        className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#769a27] px-3 text-sm font-black text-[#12221b]"
                      >
                        <ShieldCheck size={16} /> Publicar
                      </button>
                    )}
                  {canAck &&
                    selected.requiereAcuse &&
                    version.estado === "PUBLICADO" && (
                      <button
                        type="button"
                        onClick={() =>
                          void action(
                            () => libraryApi.acknowledge(user.id, version.id),
                            "Lectura confirmada.",
                          )
                        }
                        className="focus-ring min-h-11 rounded-xl border border-[var(--ares-border-strong)] px-3 text-sm font-black"
                      >
                        Confirmar lectura
                      </button>
                    )}
                </div>
              </article>
            ))}
            {canArchive && selected.estado !== "ARCHIVADO" && (
              <button
                type="button"
                onClick={() => {
                  const motivo = window.prompt("Motivo de archivo");
                  if (
                    motivo &&
                    window.confirm("¿Confirmas archivar este documento?")
                  )
                    void action(
                      () => libraryApi.archive(selected.id, motivo),
                      "Documento archivado.",
                    );
                }}
                className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-black text-white"
              >
                <Archive size={16} /> Archivar documento
              </button>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(versionDocument)}
        title="Nueva versión"
        description={versionDocument?.titulo}
        onClose={() => !busy && setVersionDocument(null)}
      >
        <form onSubmit={createVersion} className="space-y-4">
          <FileUploadField
            label="Documento"
            required
            accept="application/pdf,.docx,.xlsx,.pptx,image/jpeg,image/png"
            maxBytes={25 * 1024 * 1024}
            disabled={busy}
            onFileReady={(archivoId) =>
              setVersionDraft((old) => ({ ...old, archivoId }))
            }
          />
          <Field label="Resumen de cambios" required>
            <textarea
              className={textareaClassName}
              required
              maxLength={1000}
              value={versionDraft.resumenCambios}
              onChange={(event) =>
                setVersionDraft((old) => ({
                  ...old,
                  resumenCambios: event.target.value,
                }))
              }
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vigente desde">
              <input
                className={inputClassName}
                type="datetime-local"
                onChange={(event) =>
                  setVersionDraft((old) => ({
                    ...old,
                    vigenteDesde: event.target.value
                      ? new Date(event.target.value).toISOString()
                      : undefined,
                  }))
                }
              />
            </Field>
            <Field label="Vigente hasta">
              <input
                className={inputClassName}
                type="datetime-local"
                onChange={(event) =>
                  setVersionDraft((old) => ({
                    ...old,
                    vigenteHasta: event.target.value
                      ? new Date(event.target.value).toISOString()
                      : undefined,
                  }))
                }
              />
            </Field>
          </div>
          <button
            disabled={busy || !versionDraft.archivoId}
            className="focus-ring min-h-11 w-full rounded-xl bg-[#12221b] px-5 text-sm font-black text-white disabled:opacity-50"
          >
            {busy ? "Creando…" : "Crear versión"}
          </button>
        </form>
      </Modal>
    </div>
  );
}

const FieldUploadField = FileUploadField;
