"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Check, History, LibraryBig, RefreshCw, X } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
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
} from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
import {
  createAcademicCatalog,
  getAcademicCatalogs,
  getAcademicHistory,
  getMyAcademicProfile,
  getPendingAcademicRequests,
  requestAcademicProfile,
  resolveAcademicRequest,
  type AcademicCatalogKind,
  type AcademicCatalogs,
  type AcademicPage,
  type AcademicProfile,
} from "@/lib/backend2/academic";

const emptyForm = {
  institucionId: "",
  unidadAcademicaId: "",
  programaAcademicoId: "",
  cohorteId: "",
  inicio: "",
  fin: "",
};

function label(value?: { nombre: string } | null) {
  return value?.nombre ?? "Sin asignar";
}

export function AcademicPage() {
  const { user } = useAuth();
  const admin = user.rol === "ADMIN";
  const [profile, setProfile] = useState<AcademicProfile | null>(null);
  const [catalogs, setCatalogs] = useState<AcademicCatalogs | null>(null);
  const [history, setHistory] = useState<AcademicPage<AcademicProfile> | null>(
    null,
  );
  const [pending, setPending] = useState<AcademicPage<AcademicProfile> | null>(
    null,
  );
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextProfile, nextCatalogs, nextHistory, nextPending] =
        await Promise.all([
          getMyAcademicProfile(),
          getAcademicCatalogs(),
          getAcademicHistory(user.id),
          admin ? getPendingAcademicRequests() : Promise.resolve(null),
        ]);
      setProfile(nextProfile);
      setCatalogs(nextCatalogs);
      setHistory(nextHistory);
      setPending(nextPending);
      if (nextProfile) {
        setForm({
          institucionId: String(nextProfile.institucionId),
          unidadAcademicaId: nextProfile.unidadAcademicaId
            ? String(nextProfile.unidadAcademicaId)
            : "",
          programaAcademicoId: String(nextProfile.programaAcademicoId),
          cohorteId: nextProfile.cohorteId ? String(nextProfile.cohorteId) : "",
          inicio: nextProfile.inicio.slice(0, 10),
          fin: nextProfile.fin?.slice(0, 10) ?? "",
        });
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }, [admin, user.id]);

  useEffect(() => void load(), [load]);

  const units = useMemo(
    () =>
      catalogs?.unidades.items.filter(
        (item) =>
          !form.institucionId ||
          item.institucionId === Number(form.institucionId),
      ) ?? [],
    [catalogs, form.institucionId],
  );
  const programs = useMemo(
    () =>
      catalogs?.programas.items.filter(
        (item) =>
          !form.unidadAcademicaId ||
          item.unidadAcademicaId === Number(form.unidadAcademicaId),
      ) ?? [],
    [catalogs, form.unidadAcademicaId],
  );

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!form.institucionId || !form.programaAcademicoId || !form.inicio) {
      setError("Selecciona institución, programa y fecha de inicio.");
      return;
    }
    setSaving(true);
    try {
      await requestAcademicProfile({
        institucionId: Number(form.institucionId),
        unidadAcademicaId: form.unidadAcademicaId
          ? Number(form.unidadAcademicaId)
          : null,
        programaAcademicoId: Number(form.programaAcademicoId),
        cohorteId: form.cohorteId ? Number(form.cohorteId) : null,
        inicio: form.inicio,
        fin: form.fin || null,
      });
      setNotice(
        "Solicitud enviada. El perfil actual no cambia hasta su aprobación.",
      );
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setSaving(false);
    }
  }

  async function resolve(id: number, accept: boolean) {
    const motivo = accept
      ? undefined
      : window.prompt("Motivo del rechazo (obligatorio)")?.trim();
    if (!accept && !motivo) return;
    setSaving(true);
    setError("");
    try {
      await resolveAcademicRequest(id, accept, motivo);
      setNotice(
        accept ? "Solicitud aprobada." : "Solicitud rechazada con motivo.",
      );
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingTable />;
  if (error && !catalogs)
    return <LoadError message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Expediente académico"
        title="Perfil académico"
        description="Consulta tu adscripción vigente, solicita cambios trazables y revisa su historial."
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
        title="Adscripción vigente"
        description="La solicitud pendiente no sustituye este registro hasta ser aprobada."
      >
        {profile ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Institución" value={label(profile.institucion)} />
            <Info label="Unidad" value={label(profile.unidadAcademica)} />
            <Info label="Programa" value={label(profile.programaAcademico)} />
            <Info label="Cohorte" value={label(profile.cohorte)} />
          </dl>
        ) : (
          <EmptyState
            title="Sin perfil confirmado"
            description="Captura una solicitud para iniciar tu historial académico."
          />
        )}
      </Panel>

      {catalogs && (
        <Panel
          title="Solicitar cambio"
          description="Los catálogos se filtran por la institución y unidad seleccionadas."
        >
          <form
            onSubmit={submitProfile}
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            <SelectField
              label="Institución"
              value={form.institucionId}
              required
              onChange={(value) =>
                setForm((old) => ({
                  ...old,
                  institucionId: value,
                  unidadAcademicaId: "",
                  programaAcademicoId: "",
                }))
              }
              items={catalogs.instituciones.items}
            />
            <SelectField
              label="Unidad académica"
              value={form.unidadAcademicaId}
              onChange={(value) =>
                setForm((old) => ({
                  ...old,
                  unidadAcademicaId: value,
                  programaAcademicoId: "",
                }))
              }
              items={units}
            />
            <SelectField
              label="Programa"
              value={form.programaAcademicoId}
              required
              onChange={(value) =>
                setForm((old) => ({ ...old, programaAcademicoId: value }))
              }
              items={programs}
            />
            <SelectField
              label="Cohorte"
              value={form.cohorteId}
              onChange={(value) =>
                setForm((old) => ({ ...old, cohorteId: value }))
              }
              items={catalogs.cohortes.items}
            />
            <Field label="Inicio" required>
              <input
                className={inputClassName}
                type="date"
                value={form.inicio}
                onChange={(event) =>
                  setForm((old) => ({ ...old, inicio: event.target.value }))
                }
              />
            </Field>
            <Field label="Fin">
              <input
                className={inputClassName}
                type="date"
                min={form.inicio || undefined}
                value={form.fin}
                onChange={(event) =>
                  setForm((old) => ({ ...old, fin: event.target.value }))
                }
              />
            </Field>
            <button
              disabled={saving}
              className="focus-ring min-h-11 rounded-xl bg-[#12221b] px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2 xl:col-span-3"
            >
              {saving ? "Enviando…" : "Enviar solicitud"}
            </button>
          </form>
        </Panel>
      )}

      {admin && pending && (
        <Panel
          title={`Solicitudes pendientes (${pending.total})`}
          description="Aprobar y rechazar son acciones separadas; el rechazo requiere un motivo."
        >
          {pending.items.length ? (
            <div className="space-y-3">
              {pending.items.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-col gap-4 rounded-2xl border border-[var(--ares-border)] p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <p className="font-black">
                      Usuario #{item.usuarioId} ·{" "}
                      {label(item.programaAcademico)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--ares-muted)]">
                      Inicio {item.inicio.slice(0, 10)} ·{" "}
                      {label(item.institucion)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={saving}
                      onClick={() => void resolve(item.id, true)}
                      className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white"
                    >
                      <Check size={16} /> Aprobar
                    </button>
                    <button
                      disabled={saving}
                      onClick={() => void resolve(item.id, false)}
                      className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-black text-white"
                    >
                      <X size={16} /> Rechazar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Cola al día"
              description="No hay solicitudes académicas pendientes."
            />
          )}
        </Panel>
      )}

      <Panel
        title="Historial"
        description="Se consulta con tu ID autenticado; cada estado conserva sus fechas."
      >
        {history?.items.length ? (
          <div className="space-y-3">
            {history.items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-[var(--ares-border)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="inline-flex items-center gap-2 font-black">
                    <History size={17} /> {label(item.programaAcademico)}
                  </p>
                  <StatusBadge
                    label={item.estado.replaceAll("_", " ")}
                    tone={
                      item.estado === "CONFIRMADA"
                        ? "success"
                        : item.estado.includes("RECHAZ")
                          ? "danger"
                          : "warning"
                    }
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--ares-muted)]">
                  {label(item.institucion)} · {item.inicio.slice(0, 10)}
                  {item.fin ? ` a ${item.fin.slice(0, 10)}` : " · vigente"}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sin historial"
            description="Todavía no existen movimientos académicos."
          />
        )}
      </Panel>

      {admin && catalogs && (
        <CatalogManager catalogs={catalogs} onSaved={load} />
      )}
    </div>
  );
}

function Info({ label: title, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f4f0e7] p-4">
      <dt className="text-xs font-black uppercase tracking-wide text-[var(--ares-muted)]">
        {title}
      </dt>
      <dd className="mt-1 font-black">{value}</dd>
    </div>
  );
}

function SelectField({
  label: title,
  value,
  onChange,
  items,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { id: number; nombre: string }[];
  required?: boolean;
}) {
  return (
    <Field label={title} required={required}>
      <select
        className={inputClassName}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Sin seleccionar</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nombre}
          </option>
        ))}
      </select>
    </Field>
  );
}

function CatalogManager({
  catalogs,
  onSaved,
}: {
  catalogs: AcademicCatalogs;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<AcademicCatalogKind>("institucion");
  const [nombre, setNombre] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const needsParent = kind === "unidad" || kind === "programa";
  const parents =
    kind === "unidad" ? catalogs.instituciones.items : catalogs.unidades.items;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!nombre.trim() || (needsParent && !parentId)) {
      setError("Completa el nombre y catálogo padre.");
      return;
    }
    setBusy(true);
    try {
      await createAcademicCatalog(kind, {
        nombre: nombre.trim(),
        ...(needsParent ? { parentId: Number(parentId) } : {}),
      });
      setNombre("");
      setParentId("");
      await onSaved();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Mantenimiento de catálogos"
      description="Disponible sólo para administración global."
    >
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-3">
        <Field label="Catálogo">
          <select
            className={inputClassName}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as AcademicCatalogKind);
              setParentId("");
            }}
          >
            <option value="institucion">Institución</option>
            <option value="unidad">Unidad</option>
            <option value="programa">Programa</option>
            <option value="cohorte">Cohorte</option>
          </select>
        </Field>
        <Field label="Nombre" required>
          <input
            className={inputClassName}
            maxLength={191}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </Field>
        {needsParent ? (
          <SelectField
            label="Catálogo padre"
            required
            value={parentId}
            onChange={setParentId}
            items={parents}
          />
        ) : (
          <div aria-hidden="true" />
        )}
        <button
          disabled={busy}
          className="focus-ring min-h-11 rounded-xl bg-[#12221b] px-5 text-sm font-black text-white md:col-span-3"
        >
          {busy ? "Guardando…" : "Crear elemento"}
        </button>
      </form>
    </Panel>
  );
}
