type ErrorPayload = { error?: string };

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
  if (options.body !== undefined && !headers.has("Content-Type")) {
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
    if (
      response.status === 401 &&
      path !== "/api/auth/login" &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new Event("ares:unauthorized"));
    }
    throw new ApiError(response.status, payload?.error ?? "REQUEST_FAILED");
  }

  if (response.status === 204) return undefined as T;
  return (await parseJson<T>(response)) as T;
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
  INVALID_CREDENTIALS: "El correo o la contraseña no son correctos.",
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
  TURNO_HORARIO_INVALIDO:
    "La hora de inicio debe ser anterior a la hora de fin.",
  USER_CODE_ALREADY_EXISTS: "El código ya pertenece a otra persona.",
  USER_EMAIL_ALREADY_EXISTS: "El correo ya pertenece a otra persona.",
  USER_ALREADY_EXISTS: "Ya existe una persona con ese código o correo.",
  USER_NOT_FOUND: "La persona seleccionada ya no está disponible.",
  USER_AREA_REQUIRES_SEDE: "Selecciona una sede antes de asignar un área.",
  USER_TURNO_REQUIRES_AREA: "Selecciona un área antes de asignar un turno.",
  USER_AREA_NOT_IN_SEDE: "El área no pertenece a la sede seleccionada.",
  USER_TURNO_NOT_IN_AREA: "El turno no pertenece al área seleccionada.",
  SELF_DELETION_NOT_ALLOWED: "No puedes dar de baja tu propia cuenta.",
};

export function getApiErrorMessage(
  error: unknown,
  context: "login" | "load" | "save" | "delete" = "save",
) {
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
