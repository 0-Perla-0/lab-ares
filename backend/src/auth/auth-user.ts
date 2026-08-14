import type { EstadoUsuario, RolUsuario } from "../generated/prisma/enums";

export type AuthUser = {
  id: number;
  codigo: string;
  email: string;
  rol: RolUsuario;
  estado: EstadoUsuario;
  sedeId: number | null;
  areaId: number | null;
  turnoId: number | null;
};
