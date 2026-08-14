import { Prisma } from "../../generated/prisma/client";
import { UniqueConstraintError } from "../../common/errors/unique-constraint-error";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

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
