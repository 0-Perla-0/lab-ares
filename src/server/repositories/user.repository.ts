import { getPrisma } from "../db/prisma";

export function findByEmailForAuth(email: string) {
  return getPrisma().usuario.findUnique({
    where: { email },
    select: {
      id: true,
      codigo: true,
      email: true,
      passwordHash: true,
      rol: true,
      estado: true,
      sedeId: true,
      areaId: true,
      turnoId: true,
    },
  });
}

export function findByIdForSession(id: number) {
  return getPrisma().usuario.findUnique({
    where: { id },
    select: {
      id: true,
      codigo: true,
      email: true,
      rol: true,
      estado: true,
      sedeId: true,
      areaId: true,
      turnoId: true,
    },
  });
}
