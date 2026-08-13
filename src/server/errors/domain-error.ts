/**
 * Fallo de una regla de negocio.
 *
 * Los Services lanzan este error; solo la capa API sabe traducirlo a HTTP.
 * `kind` decide el status y `code` viaja al cliente como identificador estable.
 */
export type DomainErrorKind = "NOT_FOUND" | "CONFLICT" | "INVALID_INPUT";

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

/**
 * Datos incoherentes que Zod no puede detectar solo, porque dependen de lo ya
 * guardado: un PUT que manda solo horaFin y la deja por debajo de la horaInicio
 * que el turno ya tenía.
 */
export function invalidInput(code: string): DomainError {
  return new DomainError("INVALID_INPUT", code);
}
