import { Prisma } from "../../generated/prisma/client";
import { UniqueConstraintError } from "../errors/unique-constraint-error";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

/**
 * Envuelve una escritura para que el índice único de la base deje de ser un
 * error 500. Cubre la carrera que el chequeo previo del Service no puede
 * evitar: dos peticiones simultáneas con el mismo nombre.
 *
 * No traduce a vocabulario de negocio: eso lo decide el Service.
 */
export async function translateUniqueViolation<T>(
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      throw new UniqueConstraintError();
    }

    throw error;
  }
}
