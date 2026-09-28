"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, FileCheck2, PlusCircle } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { FileUploadField } from "@/components/backend2/file-upload-field";
import {
  EmptyState,
  ErrorBanner,
  Field,
  LoadError,
  LoadingTable,
  PageHeader,
  Panel,
  StatusBadge,
  inputClassName,
  textareaClassName,
  type StatusTone,
} from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
import {
  attachDocumentVersion,
  createDocumentRequirement,
  getDocumentDownload,
  getDocuments,
  reviewDocumentVersion,
  type DocumentRequirement,
  type DocumentsPage as DocumentsResponse,
  type DocumentState,
} from "@/lib/backend2/documents";

const tone: Record<DocumentState, StatusTone> = {
  PENDIENTE_CARGA: "warning",
  EN_REVISION: "info",
  AUTORIZADO: "success",
  RECHAZADO: "danger",
  REQUIERE_CORRECCION: "warning",
};

export function DocumentsPage() {
  const { user } = useAuth();
  const reviewer = user.rol === "ADMIN" || user.rol.startsWith("JEFE_");
  const [ownerId, setOwnerId] = useState(user.id);
  const [page, setPage] = useState<DocumentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPage(await getDocuments(ownerId));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => void load(), [load]);

  async function attach(requirement: DocumentRequirement, fileId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await attachDocumentVersion(requirement.id, fileId);
      setNotice(`La versión de ${requirement.nombre} quedó en revisión.`);
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setBusy(false);
    }
  }

  async function download(versionId: string) {
    setError("");
    try {
      const url = await getDocumentDownload(versionId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    }
  }

  if (loading) return <LoadingTable />;
  if (error && !page)
    return <LoadError message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documentos"
        title="Expediente documental"
        description="Carga archivos privados, espera el análisis de seguridad y da seguimiento a cada versión."
      />
      <ErrorBanner message={error} />
      {notice && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"
        >
          {notice}
        </div>
      )}

      {reviewer && (
        <Panel
          title="Consultar expediente"
          description="El backend aplica el alcance organizacional de tu cuenta."
        >
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}
          >
            <Field label="ID de usuario">
              <input
                className={inputClassName}
                type="number"
                min={1}
                value={ownerId}
                onChange={(event) => setOwnerId(Number(event.target.value))}
              />
            </Field>
            <button className="focus-ring min-h-11 rounded-xl bg-[#12221b] px-5 text-sm font-black text-white">
              Consultar
            </button>
          </form>
        </Panel>
      )}

      {user.rol === "ADMIN" && (
        <RequirementForm defaultUserId={ownerId} onSaved={load} />
      )}

      <Panel
        title={`Requisitos (${page?.total ?? 0})`}
        description="La tarjeta muestra siempre la versión más reciente y su resolución explícita."
      >
        {page?.items.length ? (
          <div
            role="list"
            aria-label="Requisitos documentales"
            className="grid gap-4 lg:grid-cols-2"
          >
            {page.items.map((requirement) => {
              const version = requirement.versiones[0];
              return (
                <article
                  role="listitem"
                  key={requirement.id}
                  className="rounded-2xl border border-[var(--ares-border)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-[var(--ares-muted)]">
                        {requirement.codigo}
                      </p>
                      <h3 className="mt-1 font-black">{requirement.nombre}</h3>
                    </div>
                    <StatusBadge
                      label={
                        version
                          ? version.estado.replaceAll("_", " ")
                          : "PENDIENTE CARGA"
                      }
                      tone={version ? tone[version.estado] : "warning"}
                    />
                  </div>
                  {version ? (
                    <div className="mt-4 rounded-xl bg-[#f4f0e7] p-3 text-sm">
                      <p className="font-bold">
                        Versión {version.version} ·{" "}
                        {version.archivo.originalName}
                      </p>
                      {version.comentario && (
                        <p className="mt-2 text-[var(--ares-muted)]">
                          Comentario: {version.comentario}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => void download(version.id)}
                        className="focus-ring mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--ares-border-strong)] bg-white px-4 text-sm font-black"
                      >
                        <Download size={16} /> Descargar
                      </button>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-[var(--ares-muted)]">
                      Aún no existe una versión asociada.
                    </p>
                  )}

                  {(!version ||
                    ["RECHAZADO", "REQUIERE_CORRECCION"].includes(
                      version.estado,
                    )) &&
                    ownerId === user.id && (
                      <div className="mt-4 border-t border-[var(--ares-border)] pt-4">
                        <FileUploadField
                          label="Nueva versión"
                          accept="application/pdf,image/jpeg,image/png"
                          maxBytes={25 * 1024 * 1024}
                          disabled={busy}
                          required
                          onFileReady={(fileId) =>
                            void attach(requirement, fileId)
                          }
                          hint="PDF, JPG o PNG. Primero se analiza y después se asocia al requisito."
                        />
                      </div>
                    )}
                  {reviewer && version?.estado === "EN_REVISION" && (
                    <ReviewForm versionId={version.id} onSaved={load} />
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Sin requisitos"
            description="No hay requisitos documentales activos para este usuario."
          />
        )}
      </Panel>
    </div>
  );
}

function RequirementForm({
  defaultUserId,
  onSaved,
}: {
  defaultUserId: number;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    usuarioId: String(defaultUserId),
    codigo: "",
    nombre: "",
    obligatorio: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createDocumentRequirement({
        ...form,
        usuarioId: Number(form.usuarioId),
      });
      setForm((old) => ({ ...old, codigo: "", nombre: "" }));
      await onSaved();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Crear requisito"
      description="La creación está limitada a administración global."
    >
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-3">
        <Field label="Usuario" required>
          <input
            className={inputClassName}
            type="number"
            min={1}
            value={form.usuarioId}
            onChange={(e) =>
              setForm((old) => ({ ...old, usuarioId: e.target.value }))
            }
          />
        </Field>
        <Field label="Código" required>
          <input
            className={inputClassName}
            maxLength={80}
            value={form.codigo}
            onChange={(e) =>
              setForm((old) => ({ ...old, codigo: e.target.value }))
            }
          />
        </Field>
        <Field label="Nombre" required>
          <input
            className={inputClassName}
            maxLength={191}
            value={form.nombre}
            onChange={(e) =>
              setForm((old) => ({ ...old, nombre: e.target.value }))
            }
          />
        </Field>
        <label className="flex min-h-11 items-center gap-3 text-sm font-bold md:col-span-2">
          <input
            type="checkbox"
            checked={form.obligatorio}
            onChange={(e) =>
              setForm((old) => ({ ...old, obligatorio: e.target.checked }))
            }
          />{" "}
          Requisito obligatorio
        </label>
        <button
          disabled={busy}
          className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#12221b] px-5 text-sm font-black text-white"
        >
          <PlusCircle size={16} /> {busy ? "Creando…" : "Crear requisito"}
        </button>
      </form>
    </Panel>
  );
}

function ReviewForm({
  versionId,
  onSaved,
}: {
  versionId: string;
  onSaved: () => Promise<void>;
}) {
  const [estado, setEstado] = useState<
    "AUTORIZADO" | "RECHAZADO" | "REQUIERE_CORRECCION"
  >("AUTORIZADO");
  const [comentario, setComentario] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (estado !== "AUTORIZADO" && !comentario.trim()) {
      setError("El rechazo o corrección requiere comentario.");
      return;
    }
    setBusy(true);
    try {
      await reviewDocumentVersion(versionId, estado, comentario);
      await onSaved();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="mt-4 space-y-3 border-t border-[var(--ares-border)] pt-4"
    >
      <h4 className="inline-flex items-center gap-2 font-black">
        <FileCheck2 size={17} /> Revisión
      </h4>
      <ErrorBanner message={error} />
      <Field label="Resolución">
        <select
          className={inputClassName}
          value={estado}
          onChange={(e) => setEstado(e.target.value as typeof estado)}
        >
          <option value="AUTORIZADO">Autorizar</option>
          <option value="REQUIERE_CORRECCION">Solicitar corrección</option>
          <option value="RECHAZADO">Rechazar</option>
        </select>
      </Field>
      <Field label="Comentario" required={estado !== "AUTORIZADO"}>
        <textarea
          className={textareaClassName}
          maxLength={1000}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
        />
      </Field>
      <button
        disabled={busy}
        className="focus-ring min-h-11 w-full rounded-xl bg-[#12221b] px-4 text-sm font-black text-white"
      >
        {busy ? "Guardando…" : "Registrar resolución"}
      </button>
    </form>
  );
}
