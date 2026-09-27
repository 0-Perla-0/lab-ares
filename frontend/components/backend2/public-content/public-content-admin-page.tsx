"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Archive, Plus, Send } from "lucide-react";

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
} from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
import {
  publicContentApi,
  publicPageSlugs,
  type AdminPublicPage,
  type AdminPublicPageList,
  type EditablePublicBlock,
  type PublicPageSlug,
  type PublicPageVersionInput,
} from "@/lib/backend2/public-content";
import { hasPermission, permissions } from "@/lib/permissions";

type EditableTextBlock = EditablePublicBlock;
const initialVersion: PublicPageVersionInput = {
  titulo: "",
  resumenCambios: "",
  seoTitulo: "",
  seoDescripcion: "",
  bloques: [{ tipo: "TEXTO", orden: 0, contenido: { texto: "" } }],
};
const stateTone = {
  BORRADOR: "neutral",
  PUBLICADO: "success",
  ARCHIVADO: "warning",
} as const;

export function PublicContentAdminPage() {
  const { user } = useAuth();
  const canDraft = hasPermission(user, permissions.CMS_DRAFT);
  const canPublish = hasPermission(user, permissions.CMS_PUBLISH);
  const canArchive = hasPermission(user, permissions.CMS_ARCHIVE);
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<AdminPublicPageList | null>(null);
  const [selected, setSelected] = useState<AdminPublicPage | null>(null);
  const [editorId, setEditorId] = useState<string | null | undefined>(
    undefined,
  );
  const [slug, setSlug] = useState<PublicPageSlug>("inicio");
  const [version, setVersion] =
    useState<PublicPageVersionInput>(initialVersion);
  const [assetId, setAssetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!canDraft) return;
    setLoading(true);
    setError("");
    try {
      setPage(await publicContentApi.listAdmin(pageNumber));
    } catch (e) {
      setError(getApiErrorMessage(e, "load"));
    } finally {
      setLoading(false);
    }
  }, [canDraft, pageNumber]);
  useEffect(() => void load(), [load]);
  if (!canDraft) return <ForbiddenState />;
  if (loading && !page) return <LoadingTable />;
  if (error && !page)
    return <LoadError message={error} onRetry={() => void load()} />;

  async function openDetail(id: string) {
    setBusy(true);
    try {
      setSelected(await publicContentApi.detailAdmin(id));
    } catch (e) {
      setError(getApiErrorMessage(e, "load"));
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editorId) await publicContentApi.createVersion(editorId, version);
      else await publicContentApi.createPage({ slug, ...version });
      setEditorId(undefined);
      setVersion(initialVersion);
      setNotice(editorId ? "Nueva versión creada." : "Página creada.");
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, "save"));
    } finally {
      setBusy(false);
    }
  }
  async function act(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      setNotice(message);
      if (selected)
        setSelected(await publicContentApi.detailAdmin(selected.id));
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, "save"));
    } finally {
      setBusy(false);
    }
  }
  function setBlockText(index: number, field: "title" | "body", value: string) {
    setVersion((old) => ({
      ...old,
      bloques: old.bloques.map((block, at) => {
        if (at !== index) return block;
        if (block.tipo === "TEXTO")
          return { ...block, contenido: { texto: value } };
        if (block.tipo === "ENCABEZADO")
          return { ...block, contenido: { ...block.contenido, texto: value } };
        if (block.tipo === "FAQ")
          return {
            ...block,
            contenido: {
              ...block.contenido,
              [field === "title" ? "pregunta" : "respuesta"]: value,
            },
          };
        if (block.tipo === "AVISO")
          return {
            ...block,
            contenido: {
              ...block.contenido,
              [field === "title" ? "titulo" : "texto"]: value,
            },
          };
        if (block.tipo === "LISTA")
          return {
            ...block,
            contenido: {
              ...block.contenido,
              elementos: value.split("\n").filter(Boolean),
            },
          };
        if (block.tipo === "ENLACE")
          return {
            ...block,
            contenido: {
              ...block.contenido,
              [field === "title" ? "etiqueta" : "url"]: value,
            },
          };
        if (block.tipo === "IMAGEN")
          return {
            ...block,
            contenido: {
              ...block.contenido,
              [field === "title" ? "alt" : "pie"]: value,
            },
          };
        return block;
      }),
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sitio público"
        title="Gestión de contenido"
        description="Publica bloques estructurados y seguros; nunca se interpreta HTML ingresado."
        action={{
          label: "Nueva página",
          onClick: () => {
            setEditorId(null);
            setVersion(initialVersion);
          },
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
      {canPublish && (
        <Panel
          title="Activo público"
          description="Sube una imagen mediante el almacenamiento privado; sólo DISPONIBLE puede clasificarse como pública."
        >
          <FileUploadField
            accept="image/png,image/jpeg,image/webp,image/avif"
            onFileReady={(id) =>
              void act(async () => {
                const asset = await publicContentApi.classifyAsset(id);
                setAssetId(asset.id);
              }, "Imagen clasificada como pública.")
            }
          />
          {assetId && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="break-all text-sm font-bold">
                ID público: {assetId}
              </p>
              {canArchive && (
                <button
                  type="button"
                  className="focus-ring min-h-11 rounded-xl border border-red-300 px-4 text-sm font-black text-red-700"
                  onClick={() => {
                    const motivo = window
                      .prompt("Motivo para archivar el activo")
                      ?.trim();
                    if (motivo)
                      void act(
                        () => publicContentApi.archiveAsset(assetId, motivo),
                        "Activo público archivado.",
                      ).then(() => setAssetId(""));
                  }}
                >
                  Archivar activo
                </button>
              )}
            </div>
          )}
        </Panel>
      )}
      <Panel title={`Páginas (${page?.total ?? 0})`}>
        {page?.items.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {page.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void openDetail(item.id)}
                className="focus-ring min-h-24 rounded-2xl border border-[var(--ares-border)] p-4 text-left"
              >
                <div className="flex justify-between gap-2">
                  <h2 className="font-black">/{item.slug}</h2>
                  <StatusBadge
                    label={item.estado}
                    tone={stateTone[item.estado]}
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--ares-muted)]">
                  {item.versiones[0]?.titulo ?? "Sin versión"}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sin páginas"
            description="Crea la primera versión estructurada."
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
        open={editorId !== undefined}
        title={editorId ? "Nueva versión" : "Nueva página"}
        description="Agrega bloques de texto, encabezado, aviso o FAQ."
        onClose={() => !busy && setEditorId(undefined)}
      >
        <form onSubmit={save} className="space-y-4">
          {!editorId && (
            <Field label="Ruta">
              <select
                className={inputClassName}
                value={slug}
                onChange={(e) => setSlug(e.target.value as PublicPageSlug)}
              >
                {publicPageSlugs.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Título" required>
            <input
              className={inputClassName}
              required
              value={version.titulo}
              onChange={(e) =>
                setVersion((old) => ({ ...old, titulo: e.target.value }))
              }
            />
          </Field>
          <Field label="Resumen de cambios" required>
            <textarea
              className={textareaClassName}
              required
              value={version.resumenCambios}
              onChange={(e) =>
                setVersion((old) => ({
                  ...old,
                  resumenCambios: e.target.value,
                }))
              }
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título SEO">
              <input
                className={inputClassName}
                maxLength={70}
                value={version.seoTitulo ?? ""}
                onChange={(e) =>
                  setVersion((old) => ({ ...old, seoTitulo: e.target.value }))
                }
              />
            </Field>
            <Field label="Descripción SEO">
              <textarea
                className={textareaClassName}
                maxLength={180}
                value={version.seoDescripcion ?? ""}
                onChange={(e) =>
                  setVersion((old) => ({
                    ...old,
                    seoDescripcion: e.target.value,
                  }))
                }
              />
            </Field>
          </div>
          {version.bloques.map((block, index) => (
            <div
              key={`${block.tipo}-${index}`}
              className="rounded-2xl border border-[var(--ares-border)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <strong>
                  Bloque {index + 1}: {block.tipo}
                </strong>
                <button
                  type="button"
                  className="focus-ring min-h-11 px-3 text-sm font-bold text-red-700"
                  onClick={() =>
                    setVersion((old) => ({
                      ...old,
                      bloques: old.bloques
                        .filter((_, at) => at !== index)
                        .map((item, at) => ({ ...item, orden: at })),
                    }))
                  }
                >
                  Quitar
                </button>
              </div>
              {["FAQ", "AVISO", "ENLACE", "IMAGEN"].includes(block.tipo) ? (
                <Field label={blockTitleLabel(block)}>
                  <input
                    className={inputClassName}
                    value={blockTitle(block)}
                    onChange={(e) =>
                      setBlockText(index, "title", e.target.value)
                    }
                  />
                </Field>
              ) : null}
              <Field
                label={
                  block.tipo === "ENCABEZADO"
                    ? "Encabezado"
                    : block.tipo === "FAQ"
                      ? "Respuesta"
                      : block.tipo === "LISTA"
                        ? "Elementos (uno por línea)"
                        : block.tipo === "ENLACE"
                          ? "URL HTTPS o relativa"
                          : block.tipo === "IMAGEN"
                            ? "Pie de imagen"
                            : "Contenido"
                }
              >
                <textarea
                  className={textareaClassName}
                  value={blockBody(block)}
                  onChange={(e) => setBlockText(index, "body", e.target.value)}
                />
              </Field>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {(
              [
                "TEXTO",
                "ENCABEZADO",
                "LISTA",
                "ENLACE",
                "AVISO",
                "IMAGEN",
                "FAQ",
              ] as const
            ).map((type) => (
              <button
                key={type}
                type="button"
                disabled={type === "IMAGEN" && !assetId}
                onClick={() =>
                  setVersion((old) => ({
                    ...old,
                    bloques: [
                      ...old.bloques,
                      newBlock(type, old.bloques.length, assetId),
                    ],
                  }))
                }
                className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--ares-border-strong)] px-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus size={15} /> {type}
              </button>
            ))}
          </div>
          <button
            disabled={busy || version.bloques.length === 0}
            className="focus-ring min-h-11 w-full rounded-xl bg-[#12221b] px-4 text-sm font-black text-white disabled:opacity-50"
          >
            {busy ? "Guardando…" : "Guardar borrador"}
          </button>
        </form>
      </Modal>
      <Modal
        open={Boolean(selected)}
        title={selected ? `/${selected.slug}` : "Página"}
        onClose={() => !busy && setSelected(null)}
      >
        {selected && (
          <div className="space-y-3">
            {selected.versiones.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-[var(--ares-border)] p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>
                    Versión {item.numero}: {item.titulo}
                  </strong>
                  <StatusBadge
                    label={item.estado}
                    tone={stateTone[item.estado]}
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--ares-muted)]">
                  {item.resumenCambios}
                </p>
                {canPublish && item.estado === "BORRADOR" && (
                  <button
                    type="button"
                    onClick={() =>
                      void act(
                        () => publicContentApi.publish(item.id),
                        "Versión publicada.",
                      )
                    }
                    className="focus-ring mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#769a27] px-4 text-sm font-black text-[#12221b]"
                  >
                    <Send size={16} /> Publicar
                  </button>
                )}
              </article>
            ))}
            <button
              type="button"
              onClick={() => {
                setEditorId(selected.id);
                setSelected(null);
                setVersion(initialVersion);
              }}
              className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#12221b] px-4 text-sm font-black text-white"
            >
              <Plus size={16} /> Nueva versión
            </button>
            {canArchive && selected.estado !== "ARCHIVADO" && (
              <button
                type="button"
                onClick={() => {
                  const motivo = window.prompt("Motivo de archivo");
                  if (
                    motivo &&
                    window.confirm("¿Archivar esta página pública?")
                  )
                    void act(
                      () => publicContentApi.archivePage(selected.id, motivo),
                      "Página archivada.",
                    );
                }}
                className="focus-ring ml-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-black text-white"
              >
                <Archive size={16} /> Archivar
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function newBlock(
  type: EditableTextBlock["tipo"],
  orden: number,
  assetId = "",
): EditableTextBlock {
  if (type === "ENCABEZADO")
    return { tipo: type, orden, contenido: { texto: "", nivel: 2 } };
  if (type === "FAQ")
    return { tipo: type, orden, contenido: { pregunta: "", respuesta: "" } };
  if (type === "AVISO")
    return {
      tipo: type,
      orden,
      contenido: { titulo: "", texto: "", tono: "INFORMATIVO" },
    };
  if (type === "LISTA")
    return { tipo: type, orden, contenido: { elementos: [], ordenada: false } };
  if (type === "ENLACE")
    return {
      tipo: type,
      orden,
      contenido: { etiqueta: "", url: "", nuevaVentana: false },
    };
  if (type === "IMAGEN")
    return {
      tipo: type,
      orden,
      activoPublicoId: assetId,
      contenido: { alt: "", pie: "" },
    };
  return { tipo: "TEXTO", orden, contenido: { texto: "" } };
}

function blockTitle(block: PublicPageVersionInput["bloques"][number]) {
  if (block.tipo === "FAQ") return block.contenido.pregunta;
  if (block.tipo === "AVISO") return block.contenido.titulo ?? "";
  if (block.tipo === "ENLACE") return block.contenido.etiqueta;
  if (block.tipo === "IMAGEN") return block.contenido.alt;
  return "";
}

function blockBody(block: PublicPageVersionInput["bloques"][number]) {
  if (block.tipo === "TEXTO" || block.tipo === "ENCABEZADO") {
    return block.contenido.texto;
  }
  if (block.tipo === "FAQ") return block.contenido.respuesta;
  if (block.tipo === "AVISO") return block.contenido.texto;
  if (block.tipo === "LISTA") return block.contenido.elementos.join("\n");
  if (block.tipo === "ENLACE") return block.contenido.url;
  if (block.tipo === "IMAGEN") return block.contenido.pie ?? "";
  return "";
}

function blockTitleLabel(block: PublicPageVersionInput["bloques"][number]) {
  if (block.tipo === "FAQ") return "Pregunta";
  if (block.tipo === "ENLACE") return "Etiqueta";
  if (block.tipo === "IMAGEN") return "Texto alternativo";
  return "Título";
}
