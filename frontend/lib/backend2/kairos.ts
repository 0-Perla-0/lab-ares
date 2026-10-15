import { apiRequest } from "@/lib/api";
import type { ApiEnvelope } from "@/lib/types";
import { criticalMutation } from "@/lib/service-social";

export type KairosPriority = "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
export type KairosComplexity = "BAJA" | "MEDIA" | "ALTA";
export type ProjectState = "BORRADOR" | "ACTIVO" | "ARCHIVADO";
export type ProjectRole =
  "PROPIETARIO" | "SUBLIDER" | "COLABORADOR" | "OBSERVADOR";
export type ActivityState =
  | "PENDIENTE"
  | "EN_PROGRESO"
  | "BLOQUEADA"
  | "EN_REVISION"
  | "REQUIERE_CORRECCION"
  | "TERMINADA"
  | "CANCELADA";

export type KairosMember = {
  usuarioId: number;
  rol: ProjectRole;
  createdAt: string;
  usuario: { id: number; codigo: string };
};

export type KairosProject = {
  id: string;
  nombre: string;
  descripcion: string | null;
  estado: ProjectState;
  prioridad: KairosPriority;
  creadoPorId: number;
  createdAt: string;
  updatedAt: string;
  rol?: ProjectRole;
  favorito?: boolean;
  miembros?: KairosMember[];
};

export type KairosActivity = {
  id: string;
  proyectoId?: string;
  title: string;
  description: string | null;
  state: ActivityState;
  priority: KairosPriority;
  complexity: KairosComplexity;
  startAt: string | null;
  dueAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  responsable: { id: number; codigo: string };
  participants?: Array<{ usuario: { id: number; codigo: string } }>;
};

export type KanbanCard = Pick<
  KairosActivity,
  | "id"
  | "title"
  | "state"
  | "priority"
  | "complexity"
  | "startAt"
  | "dueAt"
  | "closedAt"
  | "createdAt"
  | "responsable"
> & { vencida: boolean; participantCount: number };
export type KanbanBoard = {
  projectId: string;
  generatedAt: string;
  lanes: Array<{ state: ActivityState; total: number; items: KanbanCard[] }>;
};

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
export type Evidence = {
  id: string;
  version: number;
  comment: string | null;
  createdAt: string;
  author: { id: number; codigo: string };
  archivo: {
    id: string;
    originalName: string;
    detectedMime: string | null;
    sizeBytes: number;
    status: string;
  };
};
export type ActivityComment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: number; codigo: string };
};
export type ActivityHistory = {
  id: string;
  type: string;
  fromState: ActivityState | null;
  toState: ActivityState | null;
  comment: string | null;
  evidenceId: string | null;
  createdAt: string;
  actorId: number;
  reviewerId: number | null;
};

function query(values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

const projectPath = (projectId: string) =>
  `/api/kairos/projects/${encodeURIComponent(projectId)}`;
const activityPath = (projectId: string, activityId?: string) =>
  `${projectPath(projectId)}/activities${activityId ? `/${encodeURIComponent(activityId)}` : ""}`;

export const kairosApi = {
  listProjects(
    input: {
      page?: number;
      pageSize?: number;
      search?: string;
      favorite?: boolean;
    } = {},
  ) {
    return apiRequest<ApiEnvelope<Page<KairosProject>>>(
      `/api/kairos/projects${query(input)}`,
    ).then((x) => x.data);
  },
  getProject(id: string) {
    return apiRequest<ApiEnvelope<KairosProject>>(projectPath(id)).then(
      (x) => x.data,
    );
  },
  createProject(body: {
    nombre: string;
    descripcion?: string | null;
    prioridad?: KairosPriority;
  }) {
    return criticalMutation<KairosProject>("/api/kairos/projects", body);
  },
  updateProject(
    id: string,
    body: Partial<{
      nombre: string;
      descripcion: string | null;
      prioridad: KairosPriority;
      estado: ProjectState;
    }>,
  ) {
    return criticalMutation<KairosProject>(projectPath(id), body, "PATCH");
  },
  archiveProject(id: string) {
    return criticalMutation<KairosProject>(`${projectPath(id)}/archive`, {});
  },
  favoriteProject(id: string, enabled: boolean) {
    return criticalMutation<{ id: string; favorito: boolean }>(
      `${projectPath(id)}/favorite`,
      { enabled },
      "PUT",
    );
  },
  addMember(
    id: string,
    body: { usuarioId: number; rol: Exclude<ProjectRole, "PROPIETARIO"> },
  ) {
    return criticalMutation(`${projectPath(id)}/members`, body);
  },
  changeMemberRole(
    id: string,
    userId: number,
    rol: Exclude<ProjectRole, "PROPIETARIO">,
  ) {
    return criticalMutation(
      `${projectPath(id)}/members/${userId}`,
      { rol },
      "PATCH",
    );
  },
  transferOwnership(id: string, userId: number) {
    return criticalMutation(
      `${projectPath(id)}/members/${userId}/transfer`,
      {},
    );
  },
  removeMember(id: string, userId: number) {
    return criticalMutation(
      `${projectPath(id)}/members/${userId}`,
      {},
      "DELETE",
    );
  },
  getKanban(
    projectId: string,
    filters: Partial<{
      responsableId: number;
      participantId: number;
      priority: KairosPriority;
      complexity: KairosComplexity;
      vencida: boolean;
      limitPerLane: number;
    }> = {},
  ) {
    return apiRequest<ApiEnvelope<KanbanBoard>>(
      `${projectPath(projectId)}/kanban${query(filters)}`,
    ).then((x) => x.data);
  },
  getActivity(projectId: string, activityId: string) {
    return apiRequest<ApiEnvelope<KairosActivity>>(
      activityPath(projectId, activityId),
    ).then((x) => x.data);
  },
  createActivity(
    projectId: string,
    body: {
      title: string;
      description?: string | null;
      startAt?: string;
      dueAt?: string;
      priority?: KairosPriority;
      complexity?: KairosComplexity;
      responsableId: number;
      participantIds?: number[];
    },
  ) {
    return criticalMutation<KairosActivity>(activityPath(projectId), body);
  },
  updateActivity(
    projectId: string,
    activityId: string,
    body: Record<string, unknown>,
  ) {
    return criticalMutation<KairosActivity>(
      activityPath(projectId, activityId),
      body,
      "PATCH",
    );
  },
  transition(
    projectId: string,
    activityId: string,
    state: Extract<ActivityState, "EN_PROGRESO" | "BLOQUEADA" | "CANCELADA">,
    comment?: string,
  ) {
    return criticalMutation<KairosActivity>(
      `${activityPath(projectId, activityId)}/transition`,
      { state, ...(comment ? { comment } : {}) },
    );
  },
  submit(
    projectId: string,
    activityId: string,
    archivoId: string,
    comment?: string,
  ) {
    return criticalMutation<KairosActivity>(
      `${activityPath(projectId, activityId)}/submit`,
      { archivoId, ...(comment ? { comment } : {}) },
    );
  },
  review(
    projectId: string,
    activityId: string,
    state: "TERMINADA" | "REQUIERE_CORRECCION",
    comment?: string,
  ) {
    return criticalMutation<KairosActivity>(
      `${activityPath(projectId, activityId)}/review`,
      { state, ...(comment ? { comment } : {}) },
    );
  },
  reopen(projectId: string, activityId: string, reason: string) {
    return criticalMutation<KairosActivity>(
      `${activityPath(projectId, activityId)}/reopen`,
      { reason },
    );
  },
  history(projectId: string, activityId: string) {
    return apiRequest<ApiEnvelope<Page<ActivityHistory>>>(
      `${activityPath(projectId, activityId)}/history?page=1&pageSize=100`,
    ).then((x) => x.data);
  },
  evidence(projectId: string, activityId: string) {
    return apiRequest<ApiEnvelope<Page<Evidence>>>(
      `${activityPath(projectId, activityId)}/evidence?page=1&pageSize=100`,
    ).then((x) => x.data);
  },
  comments(projectId: string, activityId: string) {
    return apiRequest<ApiEnvelope<Page<ActivityComment>>>(
      `${activityPath(projectId, activityId)}/comments?page=1&pageSize=100`,
    ).then((x) => x.data);
  },
  comment(projectId: string, activityId: string, body: string) {
    return criticalMutation<ActivityComment>(
      `${activityPath(projectId, activityId)}/comments`,
      { body },
    );
  },
  downloadEvidence(projectId: string, activityId: string, evidenceId: string) {
    return apiRequest<ApiEnvelope<string>>(
      `${activityPath(projectId, activityId)}/evidence/${encodeURIComponent(evidenceId)}/download`,
    ).then((x) => x.data);
  },
};

export const projectCanManage = (role?: ProjectRole) =>
  role === "PROPIETARIO" || role === "SUBLIDER";
export const activityStateLabel: Record<ActivityState, string> = {
  PENDIENTE: "Pendiente",
  EN_PROGRESO: "En progreso",
  BLOQUEADA: "Bloqueada",
  EN_REVISION: "En revisión",
  REQUIERE_CORRECCION: "Requiere corrección",
  TERMINADA: "Terminada",
  CANCELADA: "Cancelada",
};
