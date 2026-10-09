"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Mail, Maximize2, Search, ShieldCheck } from "lucide-react";

import {
  EmptyState,
  ErrorBanner,
  Field,
  LoadError,
  LoadingTable,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  inputClassName,
} from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
import {
  getDirectory,
  getDirectoryPreferences,
  updateDirectoryPreferences,
  type DirectoryEntry,
  type DirectoryPage as DirectoryResponse,
  type DirectoryPreferences,
  type DirectoryScope,
} from "@/lib/backend2/directory";

export function DirectoryPage() {
  const [scope, setScope] = useState<DirectoryScope>("area");
  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<DirectoryResponse | null>(null);
  const [preferences, setPreferences] = useState<DirectoryPreferences | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextPage, nextPreferences] = await Promise.all([
        getDirectory({
          scope,
          projectId: scope === "project" ? projectId : undefined,
          q: appliedQuery,
          page: pageNumber,
        }),
        preferences ? Promise.resolve(preferences) : getDirectoryPreferences(),
      ]);
      setPage(nextPage);
      setPreferences(nextPreferences);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, pageNumber, preferences, projectId, scope]);

  useEffect(() => void load(), [load]);

  function search(event: FormEvent) {
    event.preventDefault();
    if (scope === "project" && !projectId.trim()) {
      setError("Captura el ID del proyecto para consultar su directorio.");
      return;
    }
    setError("");
    setResultsOpen(false);
    setPageNumber(1);
    setAppliedQuery(query.trim());
  }

  async function savePreferences() {
    if (!preferences) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      setPreferences(await updateDirectoryPreferences(preferences));
      setNotice("Preferencias de privacidad actualizadas.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !page) return <LoadingTable />;
  if (error && !page)
    return <LoadError message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Colaboración"
        title="Directorio"
        description="Busca personas dentro del alcance autorizado y decide dónde pueden encontrarte."
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

      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        <Panel
          className="h-full"
          title="Buscar personas"
          description="El alcance global sólo funciona cuando el backend lo permite."
        >
          <form onSubmit={search} className="space-y-4">
            <Field label="Alcance">
              <select
                className={inputClassName}
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as DirectoryScope);
                  setPageNumber(1);
                }}
              >
                <option value="area">Mi área</option>
                <option value="project">Proyecto Kairos</option>
                <option value="all">Toda la organización</option>
              </select>
            </Field>
            {scope === "project" && (
              <Field label="ID del proyecto" required>
                <input
                  className={inputClassName}
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  placeholder="cuid del proyecto"
                />
              </Field>
            )}
            <Field label="Código o correo">
              <input
                className={inputClassName}
                maxLength={80}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar…"
              />
            </Field>
            <button className="focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#17174a] px-5 text-sm font-black text-white">
              <Search size={17} /> Buscar
            </button>
          </form>
        </Panel>

        {preferences && (
          <Panel
            className="h-full"
            title="Privacidad"
            description="El correo permanece oculto a terceros salvo que autorices mostrarlo."
          >
            <div className="space-y-3">
              <Toggle
                checked={preferences.visibleEnArea}
                label="Visible en mi área"
                onChange={(checked) =>
                  setPreferences(
                    (old) => old && { ...old, visibleEnArea: checked },
                  )
                }
              />
              <Toggle
                checked={preferences.visibleEnProyectos}
                label="Visible en proyectos"
                onChange={(checked) =>
                  setPreferences(
                    (old) => old && { ...old, visibleEnProyectos: checked },
                  )
                }
              />
              <Toggle
                checked={preferences.mostrarEmail}
                label="Mostrar mi correo"
                onChange={(checked) =>
                  setPreferences(
                    (old) => old && { ...old, mostrarEmail: checked },
                  )
                }
              />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void savePreferences()}
              className="focus-ring mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#17174a] px-5 text-sm font-black text-white"
            >
              <ShieldCheck size={17} />{" "}
              {saving ? "Guardando…" : "Guardar privacidad"}
            </button>
          </Panel>
        )}

        <Panel
          className="h-full"
          title={`Resultados (${page?.total ?? 0})`}
          description="Los datos ausentes están ocultos por preferencia o por alcance."
          action={
            page?.items.length ? (
              <button
                type="button"
                onClick={() => setResultsOpen(true)}
                className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#dde1ea] px-4 text-sm font-black text-[#17174a] transition hover:border-[#f97316] hover:bg-[#fff1e8]"
              >
                <Maximize2 size={16} aria-hidden="true" /> Expandir
              </button>
            ) : undefined
          }
        >
          {page?.items.length ? (
            <DirectoryEntryCard entry={page.items[0]} />
          ) : (
            <EmptyState
              title="Sin coincidencias"
              description="Prueba otro alcance o término de búsqueda."
            />
          )}
        </Panel>
      </div>

      <Modal
        open={resultsOpen}
        onClose={() => setResultsOpen(false)}
        title={`Resultados del directorio (${page?.total ?? 0})`}
        description="Lista de personas que coinciden con el alcance y la búsqueda seleccionados."
        size="wide"
      >
        {page?.items.length ? (
          <div className="space-y-3">
            {page.items.map((entry) => (
              <DirectoryEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sin coincidencias"
            description="Prueba otro alcance o término de búsqueda."
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
      </Modal>
    </div>
  );
}

function DirectoryEntryCard({ entry }: { entry: DirectoryEntry }) {
  return (
    <article className="rounded-2xl border border-[var(--ares-border)] p-4">
      <div
        className="grid h-11 w-11 place-items-center rounded-full bg-[#f97316] font-black text-[#17174a]"
        aria-hidden="true"
      >
        {entry.codigo.slice(0, 2).toUpperCase()}
      </div>
      <h3 className="mt-3 font-black">{entry.codigo}</h3>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[var(--ares-muted)]">
        {entry.rol.replaceAll("_", " ")}
      </p>
      <p className="mt-3 text-sm text-[var(--ares-muted)]">
        {entry.area?.nombre ?? "Sin área"} · {entry.sede?.nombre ?? "Sin sede"}
      </p>
      {entry.email ? (
        <a
          href={`mailto:${entry.email}`}
          className="focus-ring mt-3 inline-flex min-h-11 max-w-full items-center gap-2 break-all rounded-xl border border-[var(--ares-border-strong)] px-3 text-sm font-black"
        >
          <Mail size={16} className="shrink-0" aria-hidden="true" />
          {entry.email}
        </a>
      ) : (
        <p className="mt-3 text-sm font-semibold text-[var(--ares-muted)]">
          Correo privado
        </p>
      )}
    </article>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-[var(--ares-border)] p-3 text-sm font-black">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
