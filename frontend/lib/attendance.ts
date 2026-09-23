export type AttendanceStatus =
  "ABIERTA" | "PENDIENTE" | "AUTORIZADA" | "RECHAZADA";

export type Attendance = {
  id: number;
  userId: number;
  user: { codigo: string };
  sedeId: number;
  areaId: number;
  turnoId: number;
  checkInAt: string;
  checkOutAt: string | null;
  durationSeconds: number | null;
  status: AttendanceStatus;
  closeReason: string | null;
  closedById: number | null;
  abnormal: boolean;
};

export type AttendancePage = {
  items: Attendance[];
  nextCursor: number | null;
  open?: Attendance | null;
  bank?: {
    pendingSeconds: number;
    authorizedSeconds: number;
    rejectedSeconds: number;
  };
  serverTime: string;
  timeZone: string;
  abnormalAfterSeconds: number;
};

export function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours} h ${minutes.toString().padStart(2, "0")} min`;
}

export function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

const pendingKeys = new Map<string, { key: string; payload: string }>();

export function idempotencyKey(
  userId: number,
  operation: string,
  target = "",
  payload = "",
) {
  const storageKey = `ares:attendance:key:${userId}:${operation}:${target}`;
  let existing = pendingKeys.get(storageKey);
  try {
    const stored =
      typeof window !== "undefined" ? sessionStorage.getItem(storageKey) : null;
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "key" in parsed &&
        "payload" in parsed &&
        typeof parsed.key === "string" &&
        typeof parsed.payload === "string"
      ) {
        existing = { key: parsed.key, payload: parsed.payload };
      }
    }
  } catch {
    /* Memory retains retry identity when storage is unavailable. */
  }
  const current =
    existing?.payload === payload
      ? existing
      : { key: crypto.randomUUID(), payload };
  pendingKeys.set(storageKey, current);
  try {
    if (typeof window !== "undefined")
      sessionStorage.setItem(storageKey, JSON.stringify(current));
  } catch {
    /* Memory fallback remains available in this tab. */
  }
  return current.key;
}

export function reconcileCheckIn(userId: number, hasOpen: boolean) {
  if (hasOpen) {
    clearIdempotencyKey(userId, "check-in");
  }
}

export function clearIdempotencyKey(
  userId: number,
  operation: string,
  target = "",
) {
  const storageKey = `ares:attendance:key:${userId}:${operation}:${target}`;
  pendingKeys.delete(storageKey);
  try {
    if (typeof window !== "undefined") sessionStorage.removeItem(storageKey);
  } catch {
    /* unavailable */
  }
}
