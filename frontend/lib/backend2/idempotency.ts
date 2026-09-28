type StoredActionKey = { key: string; payload: string };

const memoryKeys = new Map<string, StoredActionKey>();

function canonicalize(value: unknown): string {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
  return `{${entries.join(",")}}`;
}

function storageKey(userId: number, action: string, target: string) {
  return `ares:backend2:key:${userId}:${encodeURIComponent(action)}:${encodeURIComponent(target)}`;
}

function newKey() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

export function actionIdempotencyKey(input: {
  userId: number;
  action: string;
  target?: string;
  payload?: unknown;
}) {
  const keyName = storageKey(input.userId, input.action, input.target ?? "");
  const payload = canonicalize(input.payload);
  let stored = memoryKeys.get(keyName);

  try {
    const value =
      typeof window !== "undefined" ? sessionStorage.getItem(keyName) : null;
    if (value) {
      const parsed = JSON.parse(value) as Partial<StoredActionKey>;
      if (
        typeof parsed.key === "string" &&
        typeof parsed.payload === "string"
      ) {
        stored = { key: parsed.key, payload: parsed.payload };
      }
    }
  } catch {
    // Memory keeps retry identity when session storage is unavailable.
  }

  const current =
    stored?.payload === payload ? stored : { key: newKey(), payload };
  memoryKeys.set(keyName, current);
  try {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(keyName, JSON.stringify(current));
    }
  } catch {
    // Memory fallback remains stable for this runtime.
  }
  return current.key;
}

export function clearActionIdempotencyKey(input: {
  userId: number;
  action: string;
  target?: string;
}) {
  const keyName = storageKey(input.userId, input.action, input.target ?? "");
  memoryKeys.delete(keyName);
  try {
    if (typeof window !== "undefined") sessionStorage.removeItem(keyName);
  } catch {
    // Nothing else to clear when storage is unavailable.
  }
}
