import type { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "../../generated/prisma/client";

/** Joins the caller's transaction when there is one (durable intents), else opens its own. */
export function transact<T>(
  prisma: PrismaService,
  outer: Prisma.TransactionClient | undefined,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return outer ? work(outer) : prisma.$transaction(work);
}
