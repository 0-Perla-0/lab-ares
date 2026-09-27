import { apiRequest } from "@/lib/api";
import {
  actionIdempotencyKey,
  clearActionIdempotencyKey,
} from "@/lib/backend2/idempotency";
import type { ApiEnvelope } from "@/lib/types";

export const retentionCategories = [
  "IDENTIDAD_CUENTA",
  "ACADEMICO",
  "ASISTENCIA_HORAS",
  "AUSENCIAS_EVIDENCIAS",
  "EXPEDIENTE",
  "KAIROS_EVIDENCIAS",
  "BIBLIOTECA",
  "AUDITORIA",
  "NOTIFICACIONES_CORREO",
  "SESIONES_TOKENS",
  "LOGS",
  "EXPORTACIONES",
  "ARCHIVOS_RECHAZADOS",
] as const;
export type RetentionCategory = (typeof retentionCategories)[number];
export type RetentionAction = "ELIMINAR" | "ANONIMIZAR";
export type RetentionRecordState =
  | "ACTIVO"
  | "BLOQUEADO_ARCHIVADO"
  | "SUPRESION_PROGRAMADA"
  | "SUPRIMIDO"
  | "ANONIMIZADO";
export type SuppressionRequestState =
  "ABIERTA" | "EN_REVISION" | "APROBADA" | "RECHAZADA" | "EJECUTADA";
export type SuppressionBatchState =
  | "BORRADOR"
  | "AUTORIZADO"
  | "EN_EJECUCION"
  | "PAUSADO"
  | "COMPLETADO"
  | "FALLIDO";
export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export type RetentionRule = {
  id: string;
  categoria: RetentionCategory;
  version: number;
  finalidad: string;
  responsable: string;
  eventoInicio: string;
  periodoActivoDias: number;
  periodoBloqueadoDias: number;
  accionFinal: RetentionAction;
  fundamento: string;
  provisional: boolean;
  automatica: boolean;
  estado: "BORRADOR" | "APROBADA" | "SUSTITUIDA";
  referenciaAprobacion?: string | null;
  approvalDate?: string | null;
  createdAt?: string;
};
export type RetentionRecord = {
  id: string;
  categoria: RetentionCategory;
  resourceType: string;
  resourceId: string;
  subjectId?: number | null;
  estado: RetentionRecordState;
  triggeredAt: string;
  archiveDueAt: string;
  actionDueAt: string;
  regla: Pick<
    RetentionRule,
    "id" | "version" | "accionFinal" | "provisional" | "automatica" | "estado"
  >;
  retencionesLegales: Array<{
    id: string;
    responsable: string;
    reviewAt: string;
    endsAt?: string | null;
  }>;
};
export type LegalHold = {
  id: string;
  registroId: string;
  motivo: string;
  responsable: string;
  estado: "ACTIVA" | "LIBERADA";
  reviewAt: string;
  endsAt?: string | null;
  createdAt?: string;
  registro?: Pick<
    RetentionRecord,
    "id" | "categoria" | "resourceType" | "resourceId" | "subjectId" | "estado"
  >;
};
export type SuppressionRequest = {
  id: string;
  motivo: string;
  estado: SuppressionRequestState;
  clasificacion: RetentionCategory[];
  resolucion?: string | null;
  solicitante?: { id: number; codigo: string };
  resolvedAt?: string | null;
  createdAt: string;
};
export type SuppressionBatchItem = {
  id: string;
  estado:
    | "PENDIENTE"
    | "PROCESANDO"
    | "OMITIDO_RETENCION_LEGAL"
    | "EJECUTADO"
    | "FALLIDO";
  errorCode?: string | null;
  processedAt?: string | null;
  registro: Pick<
    RetentionRecord,
    | "id"
    | "categoria"
    | "resourceType"
    | "resourceId"
    | "subjectId"
    | "estado"
    | "actionDueAt"
  > & {
    regla: Pick<
      RetentionRule,
      "id" | "version" | "accionFinal" | "provisional" | "estado"
    >;
  };
};
export type SuppressionBatch = {
  id: string;
  categoria?: RetentionCategory | null;
  cutoffAt: string;
  estado: SuppressionBatchState;
  totalItems?: number;
  completedItems?: number;
  failedItems?: number;
  motivoPausa?: string | null;
  elementos: SuppressionBatchItem[];
  createdAt?: string;
};
export type SuppressionRegistryEntry = {
  id: string;
  categoria: RetentionCategory;
  resourceType: string;
  resourceFingerprint: string;
  accion: RetentionAction;
  policyVersion: number;
  loteId: string;
  occurredAt: string;
  lastReappliedAt?: string | null;
};
export type RetentionRuleInput = Omit<
  RetentionRule,
  | "id"
  | "version"
  | "estado"
  | "referenciaAprobacion"
  | "approvalDate"
  | "createdAt"
>;

function paged(filters: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return `?${params}`;
}

async function mutate<T>(
  userId: number,
  action: string,
  target: string,
  path: string,
  payload?: unknown,
) {
  const key = actionIdempotencyKey({ userId, action, target, payload });
  const response = await apiRequest<ApiEnvelope<T>>(path, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  clearActionIdempotencyKey({ userId, action, target });
  return response.data;
}

export const retentionApi = {
  myRequests() {
    return apiRequest<ApiEnvelope<SuppressionRequest[]>>(
      "/api/retention/requests/me",
    ).then((x) => x.data);
  },
  requestSuppression(userId: number, motivo: string) {
    return mutate<SuppressionRequest>(
      userId,
      "retention-request",
      "self",
      "/api/retention/requests/me",
      { motivo },
    );
  },
  rules(page = 1, categoria = "") {
    return apiRequest<ApiEnvelope<PageResult<RetentionRule>>>(
      `/api/retention/rules${paged({ page, pageSize: 20, categoria })}`,
    ).then((x) => x.data);
  },
  createRule(userId: number, input: RetentionRuleInput) {
    return mutate<RetentionRule>(
      userId,
      "retention-create-rule",
      input.categoria,
      "/api/retention/rules",
      input,
    );
  },
  approveRule(userId: number, id: string, referenciaAprobacion: string) {
    return mutate<RetentionRule>(
      userId,
      "retention-approve-rule",
      id,
      `/api/retention/rules/${encodeURIComponent(id)}/approve`,
      { referenciaAprobacion },
    );
  },
  records(
    page = 1,
    filters: { categoria?: string; estado?: string; subjectId?: number } = {},
  ) {
    return apiRequest<ApiEnvelope<PageResult<RetentionRecord>>>(
      `/api/retention/records${paged({ page, pageSize: 20, ...filters })}`,
    ).then((x) => x.data);
  },
  registerRecord(
    userId: number,
    input: {
      categoria: RetentionCategory;
      resourceType: string;
      resourceId: string;
      subjectId?: number;
      triggeredAt: string;
    },
  ) {
    return mutate<RetentionRecord>(
      userId,
      "retention-register-record",
      `${input.resourceType}:${input.resourceId}`,
      "/api/retention/records",
      input,
    );
  },
  holds(page = 1, filters: { estado?: string; registroId?: string } = {}) {
    return apiRequest<ApiEnvelope<PageResult<LegalHold>>>(
      `/api/retention/legal-holds${paged({ page, pageSize: 20, ...filters })}`,
    ).then((x) => x.data);
  },
  createHold(
    userId: number,
    input: {
      registroId: string;
      motivo: string;
      responsable: string;
      reviewAt: string;
      endsAt?: string;
    },
  ) {
    return mutate<LegalHold>(
      userId,
      "retention-create-hold",
      input.registroId,
      "/api/retention/legal-holds",
      input,
    );
  },
  releaseHold(userId: number, id: string, motivo: string) {
    return mutate<LegalHold>(
      userId,
      "retention-release-hold",
      id,
      `/api/retention/legal-holds/${encodeURIComponent(id)}/release`,
      { motivo },
    );
  },
  requests(page = 1, estado = "") {
    return apiRequest<ApiEnvelope<PageResult<SuppressionRequest>>>(
      `/api/retention/requests${paged({ page, pageSize: 20, estado })}`,
    ).then((x) => x.data);
  },
  resolveRequest(
    userId: number,
    id: string,
    input: {
      decision: "REVIEW" | "APPROVE" | "REJECT";
      resolucion: string;
      clasificacion: RetentionCategory[];
    },
  ) {
    return mutate<SuppressionRequest>(
      userId,
      "retention-resolve-request",
      id,
      `/api/retention/requests/${encodeURIComponent(id)}/resolve`,
      input,
    );
  },
  batches(page = 1, filters: { categoria?: string; estado?: string } = {}) {
    return apiRequest<ApiEnvelope<PageResult<SuppressionBatch>>>(
      `/api/retention/batches${paged({ page, pageSize: 20, ...filters })}`,
    ).then((x) => x.data);
  },
  batch(id: string) {
    return apiRequest<ApiEnvelope<SuppressionBatch>>(
      `/api/retention/batches/${encodeURIComponent(id)}`,
    ).then((x) => x.data);
  },
  createBatch(
    userId: number,
    input: { categoria?: RetentionCategory; cutoffAt: string; limit: number },
  ) {
    return mutate<SuppressionBatch>(
      userId,
      "retention-create-batch",
      input.categoria ?? "all",
      "/api/retention/batches",
      input,
    );
  },
  authorizeBatch(userId: number, id: string) {
    return mutate<SuppressionBatch>(
      userId,
      "retention-authorize-batch",
      id,
      `/api/retention/batches/${encodeURIComponent(id)}/authorize`,
    );
  },
  executeBatch(userId: number, id: string) {
    return mutate<SuppressionBatch>(
      userId,
      "retention-execute-batch",
      id,
      `/api/retention/batches/${encodeURIComponent(id)}/execute`,
    );
  },
  pauseBatch(userId: number, id: string, motivo: string) {
    return mutate<SuppressionBatch>(
      userId,
      "retention-pause-batch",
      id,
      `/api/retention/batches/${encodeURIComponent(id)}/pause`,
      { motivo },
    );
  },
  retryBatch(userId: number, id: string) {
    return mutate<SuppressionBatch>(
      userId,
      "retention-retry-batch",
      id,
      `/api/retention/batches/${encodeURIComponent(id)}/retry`,
    );
  },
  registry(page = 1, categoria = "") {
    return apiRequest<ApiEnvelope<PageResult<SuppressionRegistryEntry>>>(
      `/api/retention/suppression-registry${paged({ page, pageSize: 20, categoria })}`,
    ).then((x) => x.data);
  },
  reapply(userId: number, limit = 100) {
    return mutate<{ processed: number }>(
      userId,
      "retention-reapply",
      String(limit),
      `/api/retention/suppression-registry/reapply?limit=${limit}`,
    );
  },
};

export const destructiveRetentionActions = new Set<RetentionAction>([
  "ELIMINAR",
  "ANONIMIZAR",
]);

export function canAuthorizeRule(
  rule: Pick<RetentionRule, "provisional" | "accionFinal">,
  institutionalPoliciesApproved: boolean,
) {
  return (
    rule.provisional ||
    institutionalPoliciesApproved ||
    !destructiveRetentionActions.has(rule.accionFinal)
  );
}
