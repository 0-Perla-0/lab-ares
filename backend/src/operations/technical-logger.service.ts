import { Injectable, Logger } from "@nestjs/common";

const sensitive = /(password|secret|token|authorization|cookie|credential)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => redact(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitive.test(key) ? "[REDACTED]" : redact(item, depth + 1),
      ]),
    );
  if (typeof value === "string")
    return /(password|secret|token|authorization|cookie|credential|bearer)\s*[:= ]/i.test(
      value,
    )
      ? "[REDACTED]"
      : value.slice(0, 2000);
  return value;
}

@Injectable()
export class TechnicalLogger {
  private readonly logger = new Logger("Operations");

  write(
    level: "log" | "warn" | "error",
    event: string,
    fields: Record<string, unknown> = {},
  ) {
    this.logger[level](
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...(redact(fields) as Record<string, unknown>),
      }),
    );
  }
}
