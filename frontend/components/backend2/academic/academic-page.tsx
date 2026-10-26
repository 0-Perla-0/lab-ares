"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Check,
  GraduationCap,
  History,
  Maximize2,
  Send,
  X,
} from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import {
  ErrorBanner,
  Field,
  LoadError,
  LoadingTable,
  Modal,
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
  const [requestError, setRequestError] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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
    setRequestError("");
    setNotice("");
    if (!form.institucionId || !form.programaAcademicoId || !form.inicio) {
      setRequestError("Selecciona institución, programa y fecha de inicio.");
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
      setRequestOpen(false);
    } catch (requestError) {
      setRequestError(getApiErrorMessage(requestError, "save"));
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
          className="rounded-[var(--radius-card)] border border-[var(--color-success-border)] bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success-text)]"
        >
          {notice}
        </div>
      )}

      <div
        className={`grid items-stretch gap-5 md:grid-cols-2 ${
          admin ? "xl:grid-cols-4" : "xl:grid-cols-3"
        }`}
      >
        <Panel
          className="h-full"
          title="Adscripción vigente"
          description="El registro confirmado actualmente."
          action={
            profile ? (
              <ExpandButton
                label="Ver detalle"
                onClick={() => setProfileOpen(true)}
              />
            ) : undefined
          }
        >
          {profile ? (
            <AcademicProfilePreview item={profile} />
          ) : (
            <CompactEmpty
              title="Sin perfil confirmado"
              description="Pide un cambio para iniciar tu historial académico."
            />
          )}
        </Panel>

        {catalogs && (
          <Panel
            className="h-full"
            title="Solicitar cambio"
            description="Actualiza tu adscripción mediante una solicitud trazable."
          >
            <div className="rounded-[var(--radius-card)] bg-[var(--color-accent-soft)] p-4">
              <Send
                size={21}
                className="text-[var(--color-accent-text)]"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
                Completa la institución, el programa y las fechas desde una
                ventana dedicada.
              </p>
              <button
                type="button"
                onClick={() => {
                  setRequestError("");
                  setRequestOpen(true);
                }}
                className="focus-ring mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--color-primary)] px-4 text-sm font-bold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary)]"
              >
                Pedir cambio
              </button>
            </div>
          </Panel>
        )}

        {admin && pending && (
          <Panel
            className="h-full"
            title={`Solicitudes pendientes (${pending.total})`}
            description="Revisa la primera solicitud o abre la lista completa."
            action={
              pending.items.length ? (
                <ExpandButton
                  label="Ver todas"
                  onClick={() => setPendingOpen(true)}
                />
              ) : undefined
            }
          >
            {pending.items.length ? (
              <PendingRequestPreview item={pending.items[0]} />
            ) : (
              <CompactEmpty
                title="Cola al día"
                description="No hay solicitudes académicas pendientes."
              />
            )}
          </Panel>
        )}

        <Panel
          className="h-full"
          title={`Historial (${history?.total ?? 0})`}
          description="Consulta el último movimiento o abre el historial completo."
          action={
            history?.items.length ? (
              <ExpandButton
                label="Ver historial"
                onClick={() => setHistoryOpen(true)}
              />
            ) : undefined
          }
        >
          {history?.items.length ? (
            <AcademicHistoryItem item={history.items[0]} />
          ) : (
            <CompactEmpty
              title="Sin historial"
              description="Todavía no existen movimientos académicos."
            />
          )}
        </Panel>
      </div>

      {admin && catalogs && (
        <CatalogManager catalogs={catalogs} onSaved={load} />
      )}

      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Adscripción vigente"
        description="Detalle completo del registro académico confirmado."
      >
        {profile && <AcademicProfileDetails item={profile} />}
      </Modal>

      {catalogs && (
        <Modal
          open={requestOpen}
          onClose={() => {
            if (!saving) setRequestOpen(false);
          }}
          title="Pedir cambio"
          description="Los catálogos se filtran por la institución y unidad seleccionadas."
          size="wide"
        >
          <ErrorBanner message={requestError} />
          <form
            onSubmit={submitProfile}
            className="mt-1 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
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
              className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-5 text-sm font-bold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary)] disabled:opacity-50 md:col-span-2 xl:col-span-3"
            >
              <Send size={17} aria-hidden="true" />
              {saving ? "Enviando…" : "Enviar solicitud"}
            </button>
          </form>
        </Modal>
      )}

      <Modal
        open={pendingOpen}
        onClose={() => setPendingOpen(false)}
        title={`Solicitudes pendientes (${pending?.total ?? 0})`}
        description="Aprobar y rechazar son acciones separadas; el rechazo requiere un motivo."
        size="wide"
      >
        {pending?.items.length ? (
          <div className="space-y-3">
            {pending.items.map((item) => (
              <PendingRequestItem
                key={item.id}
                item={item}
                saving={saving}
                onResolve={resolve}
              />
            ))}
          </div>
        ) : (
          <CompactEmpty
            title="Cola al día"
            description="No hay solicitudes académicas pendientes."
          />
        )}
      </Modal>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={`Historial académico (${history?.total ?? 0})`}
        description="Lista de movimientos y estados registrados para tu perfil."
        size="wide"
      >
        {history?.items.length ? (
          <div className="space-y-3">
            {history.items.map((item) => (
              <AcademicHistoryItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <CompactEmpty
            title="Sin historial"
            description="Todavía no existen movimientos académicos."
          />
        )}
      </Modal>
    </div>
  );
}

function ExpandButton({
  label: buttonLabel,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--color-border)] px-3 text-xs font-bold text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
    >
      <Maximize2 size={15} aria-hidden="true" /> {buttonLabel}
    </button>
  );
}

function AcademicProfilePreview({ item }: { item: AcademicProfile }) {
  return (
    <article className="rounded-[var(--radius-card)] border border-[var(--ares-border)] p-4">
      <GraduationCap
        size={22}
        className="text-[var(--color-accent-text)]"
        aria-hidden="true"
      />
      <h3 className="mt-3 font-bold">{label(item.programaAcademico)}</h3>
      <p className="mt-1 text-sm text-[var(--ares-muted)]">
        {label(item.institucion)}
      </p>
      <p className="mt-3 text-xs font-bold text-[var(--ares-muted)]">
        Desde {item.inicio.slice(0, 10)}
      </p>
    </article>
  );
}

function AcademicProfileDetails({ item }: { item: AcademicProfile }) {
  return (
    <div className="space-y-5">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Info label="Institución" value={label(item.institucion)} />
        <Info label="Unidad" value={label(item.unidadAcademica)} />
        <Info label="Programa" value={label(item.programaAcademico)} />
        <Info label="Cohorte" value={label(item.cohorte)} />
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--ares-border)] p-4">
        <p className="text-sm font-bold text-[var(--ares-muted)]">
          {item.inicio.slice(0, 10)}
          {item.fin ? ` a ${item.fin.slice(0, 10)}` : " · vigente"}
        </p>
        <StatusBadge
          label={item.estado.replaceAll("_", " ")}
          tone={academicStatusTone(item.estado)}
        />
      </div>
    </div>
  );
}

function PendingRequestPreview({ item }: { item: AcademicProfile }) {
  return (
    <article className="rounded-[var(--radius-card)] border border-[var(--ares-border)] p-4">
      <p className="font-bold">{label(item.programaAcademico)}</p>
      <p className="mt-1 text-sm text-[var(--ares-muted)]">
        Usuario #{item.usuarioId} · {label(item.institucion)}
      </p>
      <div className="mt-3">
        <StatusBadge label={item.estado.replaceAll("_", " ")} tone="warning" />
      </div>
    </article>
  );
}

function PendingRequestItem({
  item,
  saving,
  onResolve,
}: {
  item: AcademicProfile;
  saving: boolean;
  onResolve: (id: number, accept: boolean) => Promise<void>;
}) {
  return (
    <article className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--ares-border)] p-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="font-bold">
          Usuario #{item.usuarioId} · {label(item.programaAcademico)}
        </p>
        <p className="mt-1 text-sm text-[var(--ares-muted)]">
          Inicio {item.inicio.slice(0, 10)} · {label(item.institucion)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void onResolve(item.id, true)}
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          <Check size={16} aria-hidden="true" /> Aprobar
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void onResolve(item.id, false)}
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-card)] bg-[var(--color-danger-solid)] px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          <X size={16} aria-hidden="true" /> Rechazar
        </button>
      </div>
    </article>
  );
}

function AcademicHistoryItem({ item }: { item: AcademicProfile }) {
  return (
    <article className="rounded-[var(--radius-card)] border border-[var(--ares-border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 font-bold">
          <History size={17} aria-hidden="true" />
          {label(item.programaAcademico)}
        </p>
        <StatusBadge
          label={item.estado.replaceAll("_", " ")}
          tone={academicStatusTone(item.estado)}
        />
      </div>
      <p className="mt-2 text-sm text-[var(--ares-muted)]">
        {label(item.institucion)} · {item.inicio.slice(0, 10)}
        {item.fin ? ` a ${item.fin.slice(0, 10)}` : " · vigente"}
      </p>
    </article>
  );
}

function academicStatusTone(estado: string) {
  if (estado === "CONFIRMADA") return "success" as const;
  if (estado.includes("RECHAZ")) return "danger" as const;
  return "warning" as const;
}

function CompactEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-inset)] p-5 text-center">
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
        {description}
      </p>
    </div>
  );
}

function Info({ label: title, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--color-surface-inset)] p-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-[var(--ares-muted)]">
        {title}
      </dt>
      <dd className="mt-1 font-bold">{value}</dd>
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
          className="focus-ring min-h-11 rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] px-5 text-sm font-bold text-[var(--color-on-primary)] md:col-span-3"
        >
          {busy ? "Guardando…" : "Crear elemento"}
        </button>
      </form>
    </Panel>
  );
}
