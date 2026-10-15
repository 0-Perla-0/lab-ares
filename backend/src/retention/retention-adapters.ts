import { ApiException } from "../common/errors/api.exception";
import type {
  CategoriaRetencion,
  AccionFinalRetencion,
} from "../generated/prisma/enums";

/** Executable resources, not merely enum values. No adapter means no batch.
 * Business-domain treatments still require an approved institutional policy. */
export const retentionAdapters: ReadonlyArray<{
  category: CategoriaRetencion;
  resourceType: string;
  action: AccionFinalRetencion;
  institutional: boolean;
}> = [
  {
    category: "EXPORTACIONES",
    resourceType: "ReporteExportacion",
    action: "ELIMINAR",
    institutional: false,
  },
  ...["Session", "RecoveryToken", "MfaChallenge"].map((resourceType) => ({
    category: "SESIONES_TOKENS" as const,
    resourceType,
    action: "ELIMINAR" as const,
    institutional: false,
  })),
  {
    category: "NOTIFICACIONES_CORREO",
    resourceType: "Notification",
    action: "ELIMINAR",
    institutional: false,
  },
  {
    category: "ARCHIVOS_RECHAZADOS",
    resourceType: "Archivo",
    action: "ANONIMIZAR",
    institutional: false,
  },
  {
    category: "ASISTENCIA_HORAS",
    resourceType: "AttendanceSignals",
    action: "ANONIMIZAR",
    institutional: true,
  },
  {
    category: "AUSENCIAS_JUSTIFICANTES",
    resourceType: "AbsenceEvidence",
    action: "ANONIMIZAR",
    institutional: true,
  },
  {
    category: "VISITAS",
    resourceType: "VisitEvidence",
    action: "ANONIMIZAR",
    institutional: true,
  },
];
export function requireRetentionAdapter(
  category: CategoriaRetencion,
  resourceType: string,
  action?: AccionFinalRetencion,
) {
  const adapter = retentionAdapters.find(
    (row) => row.category === category && row.resourceType === resourceType,
  );
  if (!adapter) throw new ApiException("RETENTION_ADAPTER_UNAVAILABLE", 409);
  if (action && adapter.action !== action)
    throw new ApiException("RETENTION_POLICY_ACTION_MISMATCH", 409);
  return adapter;
}
