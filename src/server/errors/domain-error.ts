/**
 * Fallo de una regla de negocio.
 *
 * Los Services lanzan este error; solo la capa API sabe traducirlo a HTTP.
 * `kind` decide el status y `code` viaja al cliente como identificador estable.
 */
export type DomainErrorKind = "NOT_FOUND" | "CONFLICT";

export class DomainError extends Error {
  constructor(
    readonly kind: DomainErrorKind,
    readonly code: string,
  ) {
    super(code);
    this.name = "DomainError";
  }
}

export function notFound(code: string): DomainError {
  return new DomainError("NOT_FOUND", code);
}

export function conflict(code: string): DomainError {
  return new DomainError("CONFLICT", code);
}
