"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Mail, Search, ShieldCheck } from "lucide-react";

import {
  EmptyState,
  ErrorBanner,
  Field,
  LoadError,
  LoadingTable,
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

      <Panel
        title="Buscar personas"
        description="El alcance global sólo funciona cuando el backend lo permite."
      >
        <form onSubmit={search} className="grid gap-4 md:grid-cols-3">
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
          <button className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#12221b] px-5 text-sm font-black text-white md:self-end">
            <Search size={17} /> Buscar
          </button>
        </form>
      </Panel>

      {preferences && (
        <Panel
          title="Privacidad"
          description="El correo permanece oculto a terceros salvo que autorices mostrarlo."
        >
          <div className="grid gap-3 md:grid-cols-3">
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
            className="focus-ring mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#12221b] px-5 text-sm font-black text-white"
          >
            <ShieldCheck size={17} />{" "}
            {saving ? "Guardando…" : "Guardar privacidad"}
          </button>
        </Panel>
      )}

      <Panel
        title={`Resultados (${page?.total ?? 0})`}
        description="Los datos ausentes están ocultos por preferencia o por alcance."
      >
        {page?.items.length ? (
          <div
            role="list"
            aria-label="Personas del directorio"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {page.items.map((entry) => (
              <article
                role="listitem"
                key={entry.id}
                className="rounded-2xl border border-[var(--ares-border)] p-4"
              >
                <div
                  className="grid h-11 w-11 place-items-center rounded-full bg-[#c8f169] font-black text-[#12221b]"
                  aria-hidden="true"
                >
                  {entry.codigo.slice(0, 2).toUpperCase()}
                </div>
                <h3 className="mt-3 font-black">{entry.codigo}</h3>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[var(--ares-muted)]">
                  {entry.rol.replaceAll("_", " ")}
                </p>
                <p className="mt-3 text-sm text-[var(--ares-muted)]">
                  {entry.area?.nombre ?? "Sin área"} ·{" "}
                  {entry.sede?.nombre ?? "Sin sede"}
                </p>
                {entry.email ? (
                  <a
                    href={`mailto:${entry.email}`}
                    className="focus-ring mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--ares-border-strong)] px-3 text-sm font-black"
                  >
                    <Mail size={16} /> {entry.email}
                  </a>
                ) : (
                  <p className="mt-3 text-sm font-semibold text-[var(--ares-muted)]">
                    Correo privado
                  </p>
                )}
              </article>
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
      </Panel>
    </div>
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
