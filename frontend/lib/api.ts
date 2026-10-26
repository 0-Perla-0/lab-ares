type ErrorPayload = { error?: string; details?: { factor?: string } };
let lastReadSnapshot: string | null = null;
let authenticatedActorId = 0;
export function apiActorId() {
  return authenticatedActorId;
}
export function lastApiSnapshot() {
  return lastReadSnapshot;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    options.body !== undefined &&
    !(typeof FormData !== "undefined" && options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await parseJson<ErrorPayload>(response);
    if (payload?.error === "REAUTH_REQUIRED" && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("ares:reauthenticate", {
          detail: { factor: payload.details?.factor ?? "password" },
        }),
      );
    }
    if (
      response.status === 503 &&
      payload?.error === "RECOVERY_WRITE_BARRIER_ACTIVE" &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(
        new CustomEvent("ares:write-barrier", {
          detail: { snapshot: lastReadSnapshot },
        }),
      );
    if (
      response.status === 401 &&
      path !== "/api/auth/login" &&
      (path !== "/api/auth/reauthenticate" ||
        payload?.error === "UNAUTHORIZED") &&
      !path.startsWith("/api/auth/mfa/") &&
      !path.startsWith("/api/auth/recovery/") &&
      typeof window !== "undefined"
    ) {
      authenticatedActorId = 0;
      window.dispatchEvent(new Event("ares:unauthorized"));
    }
    throw new ApiError(response.status, payload?.error ?? "REQUEST_FAILED");
  }

  if (response.status === 204) return undefined as T;
  if (
    path.startsWith("/api/") &&
    !path.startsWith("/api/auth/recovery/") &&
    typeof window !== "undefined"
  )
    window.dispatchEvent(new Event("ares:session-activity"));
  if (!options.method || options.method === "GET")
    lastReadSnapshot = new Date().toISOString();
  const result = (await parseJson<T>(response)) as T;
  if (path === "/api/auth/me") {
    const id = (result as { data?: { id?: number } })?.data?.id;
    authenticatedActorId = Number.isSafeInteger(id) && id! > 0 ? id! : 0;
  }
  if (path === "/api/auth/logout") authenticatedActorId = 0;
  return result;
}

async function parseJson<T>(response: Response): Promise<T | undefined> {
  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("application/json")) return undefined;

  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

const apiMessages: Record<string, string> = {
  OBJECT_CLEANUP_DISABLED:
    "La limpieza de objetos está deshabilitada hasta que se apruebe el tratamiento institucional.",
  OBJECT_CLEANUP_OBJECT_REFERENCED:
    "El objeto pertenece a un archivo vigente o en proceso; no se elimina.",
  OBJECT_CLEANUP_TOO_RECENT:
    "El objeto es demasiado reciente para considerarlo huérfano.",
  OBJECT_CLEANUP_KEY_PROTECTED:
    "Esa ruta pertenece a otro protocolo y no puede limpiarse aquí.",
  OBJECT_CLEANUP_SERVED_COPY_MISSING:
    "No se encontró la copia disponible; se conserva la copia de cuarentena.",
  OBJECT_CLEANUP_PURPOSE_MISMATCH:
    "El objeto ya no cumple las condiciones de la limpieza solicitada.",
  OBJECT_CLEANUP_NOTHING_TO_DELETE: "El objeto ya no existe.",
  OBJECT_CLEANUP_RESULT_UNKNOWN:
    "No se pudo confirmar el borrado. Concilia la tarea antes de reintentar.",
  RETENTION_SHARED_EVIDENCE_OR_HOLD:
    "Hay una retención legal o una referencia compartida; no se elimina.",
  REAUTH_REQUIRED:
    "Confirma tu identidad y vuelve a enviar la operación. No se aplicó ningún cambio.",
  ACADEMIC_FORMALIZATION_REQUIRED:
    "Completa y confirma la adscripción académica para la fecha de inicio antes de formalizar.",
  ACADEMIC_REFERENCE_CHANGED:
    "El catálogo académico cambió. Revisa el perfil antes de formalizar.",
  EXPEDIENT_ALREADY_FORMALIZED:
    "Ya existe una formalización para esta fecha. Consulta el historial.",
  DOCUMENT_FILE_TOO_LARGE: "El expediente admite archivos de hasta 10 MiB.",
  SELF_RECOVERY_NOT_ALLOWED: "Otra autoridad debe gestionar tu recuperación.",
  RECOVERY_ACCOUNT_NOT_ACTIVE: "Resuelve primero el estado de la cuenta.",
  FEATURE_POLICY_VERSION_CHANGED:
    "La política cambió. Recarga antes de publicar.",
  FEATURE_OUTSIDE_PILOT: "Esta función no está habilitada para tu alcance.",
  ATTENDANCE_VERSION_CHANGED:
    "El registro cambió. Actualiza la lista antes de decidir.",
  ATTENDANCE_SELF_VALIDATION: "No puedes validar tus propias horas.",
  ATTENDANCE_CORRECTOR_VALIDATION:
    "La decisión final debe emitirla otra autoridad: tú corregiste o cerraste este registro.",
  ATTENDANCE_BATCH_REQUIRES_GREEN:
    "El lote contiene registros que ya no son verdes. Actualiza y revisa individualmente.",
  ATTENDANCE_CORRECTION_REQUIRED:
    "Corrige primero el intervalo con salida omitida.",
  ATTENDANCE_OVERLAP: "El intervalo se solapa con otra asistencia.",
  ATTENDANCE_INTERVAL_INVALID:
    "Revisa las fechas: mismo día en México, entrada anterior a salida y sin horas futuras.",
  ATTENDANCE_REVIEW_STATE_INVALID:
    "Este registro ya no está pendiente de revisión.",
  ATTENDANCE_OVERNIGHT_UNSUPPORTED:
    "La primera versión no admite turnos nocturnos. Contacta a tu responsable.",
  ATTENDANCE_DAY_CLOSED:
    "El día ya fue cerrado. Registra una entrada al comenzar el siguiente día.",
  USER_INVITATION_REQUIRED:
    "Las altas se realizan mediante una invitación privada.",
  USER_PASSWORD_RESET_REQUIRED:
    "Usa recuperación de acceso; no se asignan contraseñas temporales.",
  PASSWORD_LENGTH_INVALID:
    "La contraseña debe tener entre 15 y 128 caracteres.",
  PASSWORD_BLOCKED: "Elige una frase de contraseña menos común.",
  PASSWORD_UNCHANGED: "La nueva contraseña debe ser distinta de la actual.",
  MFA_CODE_REQUIRED: "Escribe un código de tu aplicación autenticadora.",
  MFA_CODE_INVALID:
    "El código no es válido. Revisa la aplicación o usa otro código de recuperación.",
  MFA_CODE_REPLAYED: "Este código ya se utilizó. Espera al siguiente código.",
  MFA_CHALLENGE_INVALID: "La verificación expiró. Inicia sesión nuevamente.",
  MFA_ALREADY_ENABLED:
    "Desactiva primero el segundo factor mediante el flujo autorizado.",
  INVITATION_INVALID: "La invitación no es válida, expiró o ya fue utilizada.",
  RECOVERY_WRITE_BARRIER_ACTIVE:
    "Las operaciones están pausadas por recuperación. No se confirmó ningún cambio.",
  INVALID_CREDENTIALS: "El correo o la contraseña no son correctos.",
  RECOVERY_TOKEN_INVALID:
    "El token no es válido, ya fue utilizado o expiró. Solicita uno nuevo.",
  VALIDATION_ERROR: "Revisa los datos capturados e inténtalo nuevamente.",
  FORBIDDEN: "No tienes permisos para realizar esta acción.",
  UNAUTHORIZED: "Tu sesión terminó. Inicia sesión nuevamente.",
  SEDE_ALREADY_EXISTS: "Ya existe una sede con ese nombre.",
  SEDE_NOT_FOUND: "La sede seleccionada ya no está disponible.",
  SEDE_INACTIVE: "La sede seleccionada se encuentra inactiva.",
  AREA_ALREADY_EXISTS: "Ya existe un área con ese nombre en la sede.",
  AREA_NOT_FOUND: "El área seleccionada ya no está disponible.",
  AREA_INACTIVE: "El área seleccionada se encuentra inactiva.",
  TURNO_ALREADY_EXISTS: "Ya existe un turno con ese nombre en el área.",
  TURNO_NOT_FOUND: "El turno seleccionado ya no está disponible.",
  TURNO_INACTIVE: "El turno seleccionado se encuentra inactivo.",
  TURNO_HORARIO_INVALIDO: "La entrada y la salida deben tener horas distintas.",
  USER_CODE_ALREADY_EXISTS: "El código ya pertenece a otra persona.",
  USER_EMAIL_ALREADY_EXISTS: "El correo ya pertenece a otra persona.",
  USER_ALREADY_EXISTS: "Ya existe una persona con ese código o correo.",
  USER_NOT_FOUND: "La persona seleccionada ya no está disponible.",
  USER_AREA_REQUIRES_SEDE: "Selecciona una sede antes de asignar un área.",
  USER_TURNO_REQUIRES_AREA: "Selecciona un área antes de asignar un turno.",
  USER_AREA_NOT_IN_SEDE: "El área no pertenece a la sede seleccionada.",
  USER_TURNO_NOT_IN_AREA: "El turno no pertenece al área seleccionada.",
  SELF_DELETION_NOT_ALLOWED: "No puedes dar de baja tu propia cuenta.",
  ATTENDANCE_ASSIGNMENT_REQUIRED:
    "No tienes una asignación activa para registrar asistencia.",
  ATTENDANCE_ALREADY_OPEN: "Ya tienes una sesión de asistencia abierta.",
  ATTENDANCE_NOT_OPEN: "La sesión seleccionada ya está cerrada.",
  ATTENDANCE_NOT_FOUND: "La sesión de asistencia ya no está disponible.",
  IDEMPOTENCY_KEY_REUSED:
    "La operación ya fue enviada con otra información. Actualiza e inténtalo nuevamente.",
  ATTENDANCE_CLOCK_ERROR:
    "La hora oficial no pudo sincronizarse. Actualiza e inténtalo nuevamente.",
  RETRY_REQUIRED:
    "No se confirmó la operación. Puedes reintentarlo con seguridad.",
};

export function getApiErrorMessage(
  error: unknown,
  context: "login" | "load" | "save" | "delete" = "save",
) {
  if (error instanceof Error && error.message === "RESULTADO_DESCONOCIDO")
    return "RESULTADO_DESCONOCIDO: reintenta la misma operación sin cambiar datos antes de iniciar otra.";
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return "Demasiados intentos. Espera un momento antes de volver a intentar.";
    }
    return apiMessages[error.code] ?? fallback(context);
  }
  return context === "load"
    ? "No fue posible conectar con el servidor. Reintenta en un momento."
    : fallback(context);
}

function fallback(context: "login" | "load" | "save" | "delete") {
  const messages = {
    login: "No fue posible iniciar sesión. Inténtalo nuevamente.",
    load: "No fue posible cargar la información.",
    save: "No fue posible guardar los cambios.",
    delete: "No fue posible completar la baja.",
  };
  return messages[context];
}
