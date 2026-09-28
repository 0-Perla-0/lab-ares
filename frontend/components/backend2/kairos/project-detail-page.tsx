"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Archive,
  ArrowLeft,
  Download,
  History,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Users,
} from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { FileUploadField } from "@/components/backend2/file-upload-field";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  FormActions,
  LoadError,
  LoadingTable,
  Modal,
  Panel,
  StatusBadge,
  inputClassName,
  textareaClassName,
  type StatusTone,
} from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
import {
  activityStateLabel,
  kairosApi,
  projectCanManage,
  type ActivityComment,
  type ActivityHistory,
  type ActivityState,
  type Evidence,
  type KairosActivity,
  type KairosComplexity,
  type KairosPriority,
  type KairosProject,
  type KanbanBoard,
  type KanbanCard,
  type ProjectRole,
} from "@/lib/backend2/kairos";

const stateTone: Record<ActivityState, StatusTone> = {
  PENDIENTE: "neutral",
  EN_PROGRESO: "info",
  BLOQUEADA: "danger",
  EN_REVISION: "warning",
  REQUIERE_CORRECCION: "danger",
  TERMINADA: "success",
  CANCELADA: "neutral",
};
const memberRoles: Exclude<ProjectRole, "PROPIETARIO">[] = [
  "SUBLIDER",
  "COLABORADOR",
  "OBSERVADOR",
];
export function KairosProjectDetailPage({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [project, setProject] = useState<KairosProject | null>(null);
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activityOpen, setActivityOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [projectEdit, setProjectEdit] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<{
    priority?: KairosPriority;
    complexity?: KairosComplexity;
    vencida?: boolean;
  }>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextProject, nextBoard] = await Promise.all([
        kairosApi.getProject(projectId),
        kairosApi.getKanban(projectId, { ...filters, limitPerLane: 50 }),
      ]);
      setProject(nextProject);
      setBoard(nextBoard);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }, [projectId, filters]);
  useEffect(() => {
    void load();
  }, [load]);

  const canManage =
    projectCanManage(project?.rol) && project?.estado !== "ARCHIVADO";
  const favorite = project?.favorito ?? false;

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await kairosApi.updateProject(projectId, {
        nombre: String(data.get("nombre")),
        descripcion: String(data.get("descripcion")) || null,
        prioridad: String(data.get("prioridad")) as KairosPriority,
        estado: String(data.get("estado")) as "BORRADOR" | "ACTIVO",
      });
      setProjectEdit(false);
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    try {
      await kairosApi.archiveProject(projectId);
      setArchiveOpen(false);
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "delete"));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !project) return <LoadingTable />;
  if (error && !project)
    return <LoadError message={error} onRetry={() => void load()} />;
  if (!project) return null;

  return (
    <div className="space-y-6">
      <Link
        href="/portal/kairos"
        className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-extrabold"
      >
        <ArrowLeft size={18} /> Volver a proyectos
      </Link>
      <header className="rounded-3xl border border-[var(--ares-border)] bg-[var(--ares-surface)] p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-[#769a27]">
              Proyecto Kairós
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-.04em]">
              {project.nombre}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ares-muted)]">
              {project.descripcion || "Sin descripción"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge
                label={project.estado}
                tone={project.estado === "ACTIVO" ? "success" : "neutral"}
              />
              <StatusBadge
                label={project.prioridad}
                tone={
                  project.prioridad === "CRITICA"
                    ? "danger"
                    : project.prioridad === "ALTA"
                      ? "warning"
                      : "info"
                }
              />
              <StatusBadge label={project.rol ?? "MIEMBRO"} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {project.estado !== "ARCHIVADO" && (
              <button
                type="button"
                onClick={() =>
                  void kairosApi
                    .favoriteProject(projectId, !favorite)
                    .then(() =>
                      setProject((value) =>
                        value ? { ...value, favorito: !favorite } : value,
                      ),
                    )
                    .catch((reason) =>
                      setError(getApiErrorMessage(reason, "save")),
                    )
                }
                className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--ares-border-strong)] px-4 text-sm font-black"
              >
                <Star size={17} fill={favorite ? "currentColor" : "none"} />{" "}
                {favorite ? "Favorito" : "Marcar favorito"}
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => setProjectEdit(true)}
                className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--ares-border-strong)] px-4 text-sm font-black"
              >
                <Pencil size={17} /> Editar
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => setArchiveOpen(true)}
                className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-black text-red-700"
              >
                <Archive size={17} /> Archivar
              </button>
            )}
          </div>
        </div>
      </header>
      <ErrorBanner message={error} />
      <Panel
        title="Tablero de actividades"
        description="Las columnas son una proyección del estado real de cada actividad; no se crean ni ordenan por separado."
        action={
          canManage ? (
            <button
              type="button"
              onClick={() => {
                setSelectedActivity(null);
                setActivityOpen(true);
              }}
              className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--ares-ink)] px-4 text-sm font-black text-white"
            >
              <Plus size={17} /> Nueva actividad
            </button>
          ) : undefined
        }
      >
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Field label="Prioridad">
            <select
              className={inputClassName}
              value={filters.priority ?? ""}
              onChange={(event) =>
                setFilters((value) => ({
                  ...value,
                  priority: (event.target.value || undefined) as
                    KairosPriority | undefined,
                }))
              }
            >
              <option value="">Todas</option>
              <option>BAJA</option>
              <option>MEDIA</option>
              <option>ALTA</option>
              <option>CRITICA</option>
            </select>
          </Field>
          <Field label="Complejidad">
            <select
              className={inputClassName}
              value={filters.complexity ?? ""}
              onChange={(event) =>
                setFilters((value) => ({
                  ...value,
                  complexity: (event.target.value || undefined) as
                    KairosComplexity | undefined,
                }))
              }
            >
              <option value="">Todas</option>
              <option>BAJA</option>
              <option>MEDIA</option>
              <option>ALTA</option>
            </select>
          </Field>
          <Field label="Vencimiento">
            <select
              className={inputClassName}
              value={
                filters.vencida === undefined ? "" : String(filters.vencida)
              }
              onChange={(event) =>
                setFilters((value) => ({
                  ...value,
                  vencida:
                    event.target.value === ""
                      ? undefined
                      : event.target.value === "true",
                }))
              }
            >
              <option value="">Todas</option>
              <option value="true">Vencidas</option>
              <option value="false">No vencidas</option>
            </select>
          </Field>
        </div>
        {!board ? (
          <LoadingTable />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            {board.lanes.map((lane) => (
              <section
                key={lane.state}
                className="min-w-0 rounded-2xl bg-[var(--ares-surface-soft)] p-3"
                aria-labelledby={`lane-${lane.state}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 id={`lane-${lane.state}`} className="text-sm font-black">
                    {activityStateLabel[lane.state]}
                  </h3>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-black">
                    {lane.total}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {lane.items.map((card) => (
                    <ActivityCard
                      key={card.id}
                      card={card}
                      onOpen={() => {
                        setSelectedActivity(card.id);
                        setActivityOpen(true);
                      }}
                    />
                  ))}
                  {lane.items.length === 0 && (
                    <p className="rounded-xl border border-dashed border-[var(--ares-border)] p-4 text-center text-xs text-[var(--ares-muted)]">
                      Sin actividades
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </Panel>
      <MembersPanel
        project={project}
        canManage={canManage}
        onChanged={load}
        onError={setError}
      />

      <Modal
        open={projectEdit}
        onClose={() => !busy && setProjectEdit(false)}
        title="Editar proyecto"
      >
        <form
          onSubmit={(event) => void saveProject(event)}
          className="space-y-4"
        >
          <Field label="Nombre" required>
            <input
              name="nombre"
              defaultValue={project.nombre}
              required
              className={inputClassName}
            />
          </Field>
          <Field label="Descripción">
            <textarea
              name="descripcion"
              defaultValue={project.descripcion ?? ""}
              className={textareaClassName}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prioridad">
              <select
                name="prioridad"
                defaultValue={project.prioridad}
                className={inputClassName}
              >
                <option>BAJA</option>
                <option>MEDIA</option>
                <option>ALTA</option>
                <option>CRITICA</option>
              </select>
            </Field>
            <Field label="Estado">
              <select
                name="estado"
                defaultValue={project.estado}
                className={inputClassName}
              >
                <option>BORRADOR</option>
                <option>ACTIVO</option>
              </select>
            </Field>
          </div>
          <FormActions
            saving={busy}
            submitLabel="Guardar cambios"
            onCancel={() => setProjectEdit(false)}
          />
        </form>
      </Modal>
      <ConfirmDialog
        open={archiveOpen}
        title="Archivar proyecto"
        description={`¿Deseas archivar ${project.nombre}?`}
        busy={busy}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => void archive()}
        confirmLabel="Archivar"
        notice="El proyecto quedará en modo de consulta y ya no admitirá cambios."
      />
      <ActivityModal
        open={activityOpen}
        projectId={projectId}
        activityId={selectedActivity}
        defaultResponsible={user.id}
        actorId={user.id}
        role={project.rol}
        canManage={canManage}
        onClose={() => setActivityOpen(false)}
        onChanged={async () => {
          await load();
        }}
      />
    </div>
  );
}

function ActivityCard({
  card,
  onOpen,
}: {
  card: KanbanCard;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="focus-ring min-h-11 w-full rounded-xl border border-[var(--ares-border)] bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <strong className="text-sm leading-5">{card.title}</strong>
        {card.vencida && <StatusBadge label="Vencida" tone="danger" />}
      </div>
      <p className="mt-2 text-xs text-[var(--ares-muted)]">
        Responsable: {card.responsable.codigo}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge
          label={card.priority}
          tone={
            card.priority === "CRITICA"
              ? "danger"
              : card.priority === "ALTA"
                ? "warning"
                : "neutral"
          }
        />
        <StatusBadge
          label={`${card.participantCount} participante${card.participantCount === 1 ? "" : "s"}`}
        />
      </div>
    </button>
  );
}

function MembersPanel({
  project,
  canManage,
  onChanged,
  onError,
}: {
  project: KairosProject;
  canManage: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await kairosApi.addMember(project.id, {
        usuarioId: Number(data.get("usuarioId")),
        rol: String(data.get("rol")) as Exclude<ProjectRole, "PROPIETARIO">,
      });
      event.currentTarget.reset();
      await onChanged();
    } catch (error) {
      onError(getApiErrorMessage(error, "save"));
    } finally {
      setBusy(false);
    }
  }
  async function action(run: () => Promise<unknown>, confirmation: string) {
    if (!window.confirm(confirmation)) return;
    setBusy(true);
    try {
      await run();
      await onChanged();
    } catch (error) {
      onError(getApiErrorMessage(error, "save"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Integrantes"
      description="Los permisos del proyecto se derivan de la membresía activa; transferir propiedad cambia a la persona propietaria actual a sublíder."
      action={<Users size={20} />}
    >
      {canManage && (
        <form
          onSubmit={(event) => void add(event)}
          className="mb-5 grid gap-3 rounded-2xl bg-[var(--ares-surface-soft)] p-4 sm:grid-cols-[1fr_1fr_auto]"
        >
          <Field label="ID de usuario" required>
            <input
              name="usuarioId"
              type="number"
              min="1"
              required
              className={inputClassName}
            />
          </Field>
          <Field label="Rol">
            <select name="rol" className={inputClassName}>
              {memberRoles.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </Field>
          <button
            disabled={busy}
            className="focus-ring mt-2 min-h-11 self-end rounded-xl bg-[var(--ares-ink)] px-4 text-sm font-black text-white disabled:opacity-50"
          >
            Agregar
          </button>
        </form>
      )}
      {!project.miembros?.length ? (
        <EmptyState
          title="Sin integrantes"
          description="No hay membresías activas."
        />
      ) : (
        <div className="space-y-3">
          {project.miembros.map((member) => (
            <div
              key={member.usuarioId}
              className="flex flex-col gap-3 rounded-xl border border-[var(--ares-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <strong>{member.usuario.codigo}</strong>
                <p className="text-xs text-[var(--ares-muted)]">
                  Usuario #{member.usuarioId}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canManage && member.rol !== "PROPIETARIO" ? (
                  <select
                    aria-label={`Rol de ${member.usuario.codigo}`}
                    disabled={busy}
                    className={`${inputClassName} mt-0 w-auto`}
                    value={member.rol}
                    onChange={(event) =>
                      void kairosApi
                        .changeMemberRole(
                          project.id,
                          member.usuarioId,
                          event.target.value as Exclude<
                            ProjectRole,
                            "PROPIETARIO"
                          >,
                        )
                        .then(onChanged)
                        .catch((error) =>
                          onError(getApiErrorMessage(error, "save")),
                        )
                    }
                  >
                    {memberRoles.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                ) : (
                  <StatusBadge
                    label={member.rol}
                    tone={member.rol === "PROPIETARIO" ? "success" : "neutral"}
                  />
                )}
                {canManage && member.rol !== "PROPIETARIO" && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void action(
                          () =>
                            kairosApi.transferOwnership(
                              project.id,
                              member.usuarioId,
                            ),
                          `¿Transferir la propiedad a ${member.usuario.codigo}?`,
                        )
                      }
                      className="focus-ring min-h-11 rounded-xl border border-amber-200 px-3 text-xs font-black text-amber-800"
                    >
                      Transferir
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void action(
                          () =>
                            kairosApi.removeMember(
                              project.id,
                              member.usuarioId,
                            ),
                          `¿Quitar a ${member.usuario.codigo} del proyecto?`,
                        )
                      }
                      className="focus-ring min-h-11 rounded-xl border border-red-200 px-3 text-xs font-black text-red-700"
                    >
                      Quitar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ActivityModal({
  open,
  projectId,
  activityId,
  defaultResponsible,
  actorId,
  role,
  canManage,
  onClose,
  onChanged,
}: {
  open: boolean;
  projectId: string;
  activityId: string | null;
  defaultResponsible: number;
  actorId: number;
  role?: ProjectRole;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [activity, setActivity] = useState<KairosActivity | null>(null);
  const [history, setHistory] = useState<ActivityHistory[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileId, setFileId] = useState("");
  const isCreate = !activityId;
  const canEdit = isCreate || (canManage && activity?.state === "PENDIENTE");
  const canAct = canManage || activity?.responsable.id === actorId;
  const canSubmit =
    canAct &&
    (activity?.state === "EN_PROGRESO" ||
      activity?.state === "REQUIERE_CORRECCION");
  const canReview =
    canManage &&
    activity?.state === "EN_REVISION" &&
    activity.responsable.id !== actorId;
  const transitionTargets = activity
    ? ((
        {
          PENDIENTE: ["EN_PROGRESO", "CANCELADA"],
          EN_PROGRESO: ["BLOQUEADA", "CANCELADA"],
          BLOQUEADA: ["EN_PROGRESO", "CANCELADA"],
          REQUIERE_CORRECCION: ["EN_PROGRESO"],
        } as Partial<
          Record<
            ActivityState,
            Array<
              Extract<ActivityState, "EN_PROGRESO" | "BLOQUEADA" | "CANCELADA">
            >
          >
        >
      )[activity.state] ?? [])
    : [];
  const refresh = useCallback(async () => {
    if (!activityId) {
      setActivity(null);
      return;
    }
    setLoading(true);
    try {
      const [detail, eventPage, evidencePage, commentPage] = await Promise.all([
        kairosApi.getActivity(projectId, activityId),
        kairosApi.history(projectId, activityId),
        kairosApi.evidence(projectId, activityId),
        kairosApi.comments(projectId, activityId),
      ]);
      setActivity(detail);
      setHistory(eventPage.items);
      setEvidence(evidencePage.items);
      setComments(commentPage.items);
    } catch (reason) {
      setError(getApiErrorMessage(reason, "load"));
    } finally {
      setLoading(false);
    }
  }, [projectId, activityId]);
  useEffect(() => {
    if (open) {
      setError("");
      setFileId("");
      void refresh();
    }
  }, [open, refresh]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const participantIds = String(data.get("participantIds") ?? "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    const body = {
      title: String(data.get("title")),
      description: String(data.get("description")) || null,
      startAt: String(data.get("startAt")) || undefined,
      dueAt: String(data.get("dueAt")) || undefined,
      priority: String(data.get("priority")) as KairosPriority,
      complexity: String(data.get("complexity")) as KairosComplexity,
      responsableId: Number(data.get("responsableId")),
      participantIds,
    };
    setBusy(true);
    try {
      if (activityId)
        await kairosApi.updateActivity(projectId, activityId, body);
      else await kairosApi.createActivity(projectId, body);
      await onChanged();
      if (activityId) await refresh();
      else onClose();
    } catch (reason) {
      setError(getApiErrorMessage(reason, "save"));
    } finally {
      setBusy(false);
    }
  }
  async function run(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await operation();
      await Promise.all([refresh(), onChanged()]);
    } catch (reason) {
      setError(getApiErrorMessage(reason, "save"));
    } finally {
      setBusy(false);
    }
  }
  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activityId) return;
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body"));
    await run(() => kairosApi.comment(projectId, activityId, body));
    form.reset();
  }
  async function download(item: Evidence) {
    if (!activityId) return;
    try {
      const url = await kairosApi.downloadEvidence(
        projectId,
        activityId,
        item.id,
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (reason) {
      setError(getApiErrorMessage(reason, "load"));
    }
  }
  const participantText = useMemo(
    () =>
      activity?.participants?.map((item) => item.usuario.id).join(", ") ?? "",
    [activity],
  );
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={
        isCreate
          ? "Nueva actividad"
          : (activity?.title ?? "Detalle de actividad")
      }
      description={
        isCreate
          ? "La actividad aparecerá en el tablero según su estado real."
          : "Actualiza, entrega, revisa y consulta su trazabilidad completa."
      }
    >
      {loading ? (
        <LoadingTable />
      ) : (
        <div className="space-y-6">
          <ErrorBanner message={error} />
          {canEdit ? (
            <form onSubmit={(event) => void save(event)} className="space-y-4">
              <Field label="Título" required>
                <input
                  name="title"
                  className={inputClassName}
                  defaultValue={activity?.title ?? ""}
                  required
                  maxLength={191}
                />
              </Field>
              <Field label="Descripción">
                <textarea
                  name="description"
                  className={textareaClassName}
                  defaultValue={activity?.description ?? ""}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Responsable (ID)" required>
                  <input
                    name="responsableId"
                    type="number"
                    min="1"
                    className={inputClassName}
                    defaultValue={
                      activity?.responsable.id ?? defaultResponsible
                    }
                    required
                  />
                </Field>
                <Field label="Participantes (IDs separados por coma)">
                  <input
                    name="participantIds"
                    className={inputClassName}
                    defaultValue={participantText}
                  />
                </Field>
                <Field label="Inicio">
                  <input
                    name="startAt"
                    type="datetime-local"
                    className={inputClassName}
                    defaultValue={dateInput(activity?.startAt)}
                  />
                </Field>
                <Field label="Vencimiento">
                  <input
                    name="dueAt"
                    type="datetime-local"
                    className={inputClassName}
                    defaultValue={dateInput(activity?.dueAt)}
                  />
                </Field>
                <Field label="Prioridad">
                  <select
                    name="priority"
                    className={inputClassName}
                    defaultValue={activity?.priority ?? "MEDIA"}
                  >
                    <option>BAJA</option>
                    <option>MEDIA</option>
                    <option>ALTA</option>
                    <option>CRITICA</option>
                  </select>
                </Field>
                <Field label="Complejidad">
                  <select
                    name="complexity"
                    className={inputClassName}
                    defaultValue={activity?.complexity ?? "MEDIA"}
                  >
                    <option>BAJA</option>
                    <option>MEDIA</option>
                    <option>ALTA</option>
                  </select>
                </Field>
              </div>
              <FormActions
                saving={busy}
                submitLabel={isCreate ? "Crear actividad" : "Guardar actividad"}
                onCancel={onClose}
              />
            </form>
          ) : activity ? (
            <Panel title="Información de la actividad">
              <p className="text-sm leading-6 text-[var(--ares-muted)]">
                {activity.description || "Sin descripción"}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge
                  label={activityStateLabel[activity.state]}
                  tone={stateTone[activity.state]}
                />
                <StatusBadge label={activity.priority} />
                <StatusBadge label={activity.complexity} />
                <StatusBadge
                  label={`Responsable: ${activity.responsable.codigo}`}
                />
              </div>
            </Panel>
          ) : null}
          {activity && activityId && (
            <>
              <Panel
                title="Flujo de trabajo"
                description={`Estado actual: ${activityStateLabel[activity.state]}`}
              >
                <div className="flex flex-wrap gap-2">
                  {canAct &&
                    transitionTargets.map((state) => (
                      <button
                        key={state}
                        type="button"
                        disabled={busy || activity.state === state}
                        onClick={() => {
                          const comment =
                            window.prompt(
                              `Comentario para ${activityStateLabel[state]} (opcional)`,
                            ) ?? undefined;
                          if (comment !== undefined)
                            void run(() =>
                              kairosApi.transition(
                                projectId,
                                activityId,
                                state,
                                comment,
                              ),
                            );
                        }}
                        className="focus-ring min-h-11 rounded-xl border border-[var(--ares-border-strong)] px-3 text-sm font-black disabled:opacity-40"
                      >
                        {activityStateLabel[state]}
                      </button>
                    ))}
                  {canManage &&
                    (activity.state === "TERMINADA" ||
                      activity.state === "CANCELADA") && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const reason = window.prompt("Motivo para reabrir");
                          if (reason)
                            void run(() =>
                              kairosApi.reopen(projectId, activityId, reason),
                            );
                        }}
                        className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-200 px-3 text-sm font-black text-amber-800"
                      >
                        <RefreshCw size={16} /> Reabrir
                      </button>
                    )}
                </div>
              </Panel>
              {canSubmit && (
                <Panel
                  title="Entregar evidencia"
                  description="Sólo se puede enviar cuando el análisis del archivo termina en DISPONIBLE."
                >
                  <FileUploadField
                    label="Archivo de evidencia"
                    required
                    onFileReady={(id) => setFileId(id)}
                  />
                  <Field label="Comentario de la entrega">
                    <textarea
                      id="submit-comment"
                      className={textareaClassName}
                    />
                  </Field>
                  <button
                    type="button"
                    disabled={busy || !fileId}
                    onClick={() => {
                      const comment = (
                        document.getElementById(
                          "submit-comment",
                        ) as HTMLTextAreaElement | null
                      )?.value;
                      void run(() =>
                        kairosApi.submit(
                          projectId,
                          activityId,
                          fileId,
                          comment,
                        ),
                      );
                    }}
                    className="focus-ring mt-4 min-h-11 rounded-xl bg-[var(--ares-ink)] px-4 text-sm font-black text-white disabled:opacity-45"
                  >
                    Enviar a revisión
                  </button>
                </Panel>
              )}
              {canReview && (
                <Panel title="Revisión">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          kairosApi.review(
                            projectId,
                            activityId,
                            "TERMINADA",
                            window.prompt(
                              "Comentario de aprobación (opcional)",
                            ) ?? undefined,
                          ),
                        )
                      }
                      className="focus-ring min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white"
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const comment = window.prompt(
                          "Indica qué debe corregirse",
                        );
                        if (comment !== null)
                          void run(() =>
                            kairosApi.review(
                              projectId,
                              activityId,
                              "REQUIERE_CORRECCION",
                              comment,
                            ),
                          );
                      }}
                      className="focus-ring min-h-11 rounded-xl bg-red-700 px-4 text-sm font-black text-white"
                    >
                      Solicitar corrección
                    </button>
                  </div>
                </Panel>
              )}
              <Panel title="Evidencias" action={<Download size={18} />}>
                {evidence.length === 0 ? (
                  <p className="text-sm text-[var(--ares-muted)]">
                    Aún no hay entregas.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {evidence.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-2 rounded-xl border border-[var(--ares-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <strong className="text-sm">
                            v{item.version} · {item.archivo.originalName}
                          </strong>
                          <p className="text-xs text-[var(--ares-muted)]">
                            {item.author.codigo} · {formatDate(item.createdAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void download(item)}
                          className="focus-ring min-h-11 rounded-xl border border-[var(--ares-border-strong)] px-3 text-sm font-black"
                        >
                          Descargar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title="Comentarios" action={<MessageSquare size={18} />}>
                {role !== "OBSERVADOR" && (
                  <form
                    onSubmit={(event) => void addComment(event)}
                    className="flex flex-col gap-2 sm:flex-row"
                  >
                    <Field label="Nuevo comentario">
                      <input
                        name="body"
                        required
                        maxLength={2000}
                        className={inputClassName}
                      />
                    </Field>
                    <button
                      disabled={busy}
                      className="focus-ring mt-2 min-h-11 self-end rounded-xl bg-[var(--ares-ink)] px-4 text-sm font-black text-white"
                    >
                      Publicar
                    </button>
                  </form>
                )}
                <div className="mt-4 space-y-2">
                  {comments.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-xl bg-[var(--ares-surface-soft)] p-3"
                    >
                      <p className="text-sm">{item.body}</p>
                      <p className="mt-1 text-xs text-[var(--ares-muted)]">
                        {item.author.codigo} · {formatDate(item.createdAt)}
                      </p>
                    </article>
                  ))}
                </div>
              </Panel>
              <Panel title="Historial" action={<History size={18} />}>
                <ol className="space-y-3">
                  {history.map((item) => (
                    <li
                      key={item.id}
                      className="border-l-2 border-[#c8f169] pl-3"
                    >
                      <div className="flex flex-wrap gap-2">
                        <strong className="text-sm">{item.type}</strong>
                        {item.toState && (
                          <StatusBadge
                            label={activityStateLabel[item.toState]}
                            tone={stateTone[item.toState]}
                          />
                        )}
                      </div>
                      {item.comment && (
                        <p className="mt-1 text-sm text-[var(--ares-muted)]">
                          {item.comment}
                        </p>
                      )}
                      <time className="text-xs text-[var(--ares-muted)]">
                        {formatDate(item.createdAt)}
                      </time>
                    </li>
                  ))}
                </ol>
              </Panel>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function dateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
