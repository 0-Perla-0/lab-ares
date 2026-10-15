import { ApiError, apiRequest, apiActorId } from "./api";
import { clearIdempotencyKey, idempotencyKey } from "./attendance";
import type { ApiEnvelope } from "./types";

export type Absence = {
  id: string;
  userId: number;
  user: { codigo: string };
  fecha: string;
  estado: string;
  version: number;
  plazoLimiteAt: string;
  aclaracionLimiteAt: string | null;
  apelacionLimiteAt: string | null;
  motivoResolucion: string | null;
  resueltoPorId: number | null;
  businessDaysRemaining: number | null;
  justificaciones: {
    id: string;
    motivo: string;
    archivoId: string | null;
    createdAt: string;
  }[];
  apelacion: {
    argumento: string;
    archivoId: string | null;
    resolucion: string | null;
  } | null;
};
export type CalendarEvent = {
  id: string;
  titulo: string;
  motivo: string;
  alcance: string;
  efecto: string;
  tipo: string;
  usuarioId: number | null;
  areaId: number | null;
  sedeId: number | null;
  fechaInicio: string;
  fechaFin: string;
  horaInicio: string | null;
  horaFin: string | null;
  createdAt: string;
};
export type CalendarData = {
  items: CalendarEvent[];
  shift: { start: string; end: string; days: string[] } | null;
};
export type Preview = {
  previewId: string;
  expiresAt: string;
  users: number;
  attendances: number;
  absences: number;
  definitive: number;
};

/** Persist only a digest, never a medical narrative, in retry identity storage. */
export async function socialMutation<T>(
  userId: number,
  path: string,
  body: object,
  method = "POST",
  strict = false,
) {
  const payload = JSON.stringify(body);
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const operation = `social:${method}`;
  const key = idempotencyKey(userId, operation, path, digest, strict);
  try {
    const result = await apiRequest<ApiEnvelope<T>>(path, {
      method,
      headers: { "Idempotency-Key": key },
      body: payload,
    });
    if (!result || !("data" in result))
      throw new Error("RESULTADO_DESCONOCIDO");
    clearIdempotencyKey(userId, operation, path);
    return result.data;
  } catch (cause) {
    if (
      cause instanceof ApiError &&
      cause.status >= 400 &&
      cause.status < 500 &&
      ![408, 429].includes(cause.status) &&
      !["RETRY_REQUIRED", "ATTENDANCE_RETRY_REQUIRED"].includes(cause.code)
    )
      clearIdempotencyKey(userId, operation, path);
    throw cause;
  }
}
/** AuthProvider resolves the actor before protected pages mount. Only a digest
 * and random key persist; changed payloads cannot replace an unresolved intent. */
const inFlightCritical = new Map<
  string,
  { payload: string; promise: Promise<unknown> }
>();
export function criticalMutation<T>(
  path: string,
  body: object,
  method = "POST",
) {
  const actor = apiActorId(),
    scope = `${actor}:${method}:${path}`,
    payload = JSON.stringify(body);
  const existing = inFlightCritical.get(scope);
  if (existing)
    return existing.payload === payload
      ? (existing.promise as Promise<T>)
      : Promise.reject(new Error("RESULTADO_DESCONOCIDO"));
  const promise = socialMutation<T>(actor, path, body, method, true).finally(
    () => {
      if (inFlightCritical.get(scope)?.promise === promise)
        inFlightCritical.delete(scope);
    },
  );
  inFlightCritical.set(scope, { payload, promise });
  return promise;
}
export function socialError(cause: unknown) {
  if (!(cause instanceof ApiError))
    return "RESULTADO_DESCONOCIDO: no hay confirmación del servidor. Reintenta sin cambiar los datos; se conservará la misma clave.";
  const messages: Record<string, string> = {
    REAUTH_REQUIRED:
      "Confirma tu identidad y vuelve a enviar la operación. No se aplicó ningún cambio.",
    ACADEMIC_FORMALIZATION_REQUIRED:
      "Completa y confirma la adscripción académica para la fecha de inicio antes de formalizar.",
    ACADEMIC_REFERENCE_CHANGED:
      "El catálogo académico cambió. Revisa el perfil antes de formalizar.",
    EXPEDIENT_ALREADY_FORMALIZED:
      "Esta fecha ya está formalizada. Consulta la constancia registrada.",
    FEATURE_OUTSIDE_PILOT: "Esta función no está habilitada para tu alcance.",
    FEATURE_POLICY_VERSION_CHANGED:
      "La política cambió. Recarga antes de publicar.",
    SERVICE_PERIOD_VERSION_CHANGED:
      "El periodo cambió. Actualiza antes de confirmar.",
    SERVICE_PERIOD_STATE_INVALID:
      "El periodo no admite esa transición. Actualiza el historial.",
    SERVICE_PERIOD_INVALID_DATES:
      "La fecha final debe ser igual o posterior al inicio formalizado.",
    SERVICE_PERIOD_ALREADY_REGISTERED:
      "Esta formalización ya tiene un periodo registrado.",
    SERVICE_PERIOD_TARGET_INACTIVE:
      "El inicio requiere una cuenta de prestador activa.",
    SELF_RECOVERY_NOT_ALLOWED: "Otra autoridad debe gestionar tu recuperación.",
    RECOVERY_ACCOUNT_NOT_ACTIVE: "Resuelve primero el estado de la cuenta.",
    FEATURE_DISABLED: "Este módulo está deshabilitado en este entorno.",
    INVENTORY_VERSION_CHANGED: "El artículo cambió. Actualiza antes de operar.",
    INVENTORY_STOCK_INVALID:
      "El movimiento dejaría stock negativo o excedería el máximo.",
    INVENTORY_ASSET_UNAVAILABLE:
      "El activo ya no está disponible para préstamo.",
    INVENTORY_LEDGER_MISMATCH:
      "El saldo no coincide con el libro mayor. Requiere revisión técnica; no se modificó el stock.",
    VISIT_STATE_INVALID:
      "La visita no admite esta acción o está fuera de su ventana de acceso.",
    VISIT_VERSION_CHANGED:
      "La visita cambió. Busca de nuevo antes de registrar.",
    ATTENDANCE_OVERLAP: "El intervalo se solapa con otra asistencia.",
    ATTENDANCE_INTERVAL_INVALID:
      "Revisa el día en México, el orden de horas y que no sean futuras.",
    RECOVERY_WRITE_BARRIER_ACTIVE:
      "Modo lectura: la recuperación ha pausado las escrituras. No se confirmó ningún cambio.",
    RETRY_REQUIRED:
      "No se confirmó la operación. Reintenta sin cambiar los datos para conservar su identidad.",
    ABSENCE_STATE_INVALID:
      "La ausencia ya no admite esta acción. Actualiza la lista.",
    ABSENCE_VERSION_CHANGED: "La ausencia cambió. Actualiza antes de resolver.",
    ABSENCE_DEADLINE_EXPIRED: "El plazo para presentar este escrito terminó.",
    ABSENCE_EVIDENCE_UNAVAILABLE:
      "El soporte debe ser tuyo, PDF/JPG/PNG y estar disponible tras el análisis.",
    ABSENCE_SELF_RESOLUTION: "No puedes resolver tus propias ausencias.",
    ABSENCE_INDEPENDENT_REVIEW_REQUIRED:
      "La apelación necesita una autoridad distinta y no inferior a quien rechazó.",
    CALENDAR_PREVIEW_REQUIRED:
      "Genera primero la vista previa del cambio retroactivo.",
    CALENDAR_PREVIEW_STALE:
      "La vista previa expiró o cambió el impacto. Genérala nuevamente.",
    CALENDAR_ADMIN_CONFIRMATION_REQUIRED:
      "Una ausencia definitiva exige confirmación explícita de Administración.",
  };
  return (
    messages[cause.code] ??
    "El servidor rechazó la operación. Revisa tus permisos y los datos capturados."
  );
}
