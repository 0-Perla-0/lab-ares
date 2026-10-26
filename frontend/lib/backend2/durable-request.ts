import { apiRequest } from "@/lib/api";
import {
  actionIdempotencyKey,
  clearActionIdempotencyKey,
} from "@/lib/backend2/idempotency";

/** One logical mutation = one stored key until the server answers definitively. */
export async function durableRequest<T = unknown>(
  userId: number,
  action: string,
  target: string,
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
) {
  const key = actionIdempotencyKey({ userId, action, target, payload: body });
  const result = await apiRequest<T>(path, {
    method,
    headers: { "Idempotency-Key": key },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  clearActionIdempotencyKey({ userId, action, target });
  return result;
}
