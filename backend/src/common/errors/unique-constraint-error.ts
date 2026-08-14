/**
 * Violación de un índice único, ya despojada de cualquier detalle de Prisma o
 * de MariaDB. La lanza el Repository (única capa que puede ver el error
 * original) y la traduce el Service al código de dominio que corresponda.
 */
export class UniqueConstraintError extends Error {
  constructor() {
    super("Unique constraint violation");
    this.name = "UniqueConstraintError";
  }
}
