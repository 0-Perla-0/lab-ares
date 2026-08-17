import { EstadoUsuario, RolUsuario } from "../generated/prisma/enums";

export type BootstrapAdminInput = {
  codigo: string;
  email: string;
  password: string;
};

export type BootstrapAdminResult =
  | { status: "existing"; id: number }
  | { status: "created"; id: number }
  | { status: "recovered"; id: number };

export type BootstrapAdminRepository = {
  findActiveAdmin(): Promise<{ id: number } | null>;
  findByEmailOrCode(
    email: string,
    codigo: string,
  ): Promise<{ id: number; email: string; codigo: string } | null>;
  create(input: {
    codigo: string;
    email: string;
    passwordHash: string;
  }): Promise<{ id: number }>;
  recover(id: number, input: { passwordHash: string }): Promise<{ id: number }>;
};

export async function bootstrapAdmin(
  repository: BootstrapAdminRepository,
  input: BootstrapAdminInput,
  hashPassword: (password: string) => Promise<string>,
): Promise<BootstrapAdminResult> {
  const activeAdmin = await repository.findActiveAdmin();
  if (activeAdmin) return { status: "existing", id: activeAdmin.id };

  const existing = await repository.findByEmailOrCode(
    input.email,
    input.codigo,
  );
  const passwordHash = await hashPassword(input.password);

  if (existing) {
    if (existing.email !== input.email || existing.codigo !== input.codigo) {
      throw new Error(
        "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_CODE must identify the same user",
      );
    }

    const recovered = await repository.recover(existing.id, { passwordHash });
    return { status: "recovered", id: recovered.id };
  }

  const created = await repository.create({
    codigo: input.codigo,
    email: input.email,
    passwordHash,
  });
  return { status: "created", id: created.id };
}

export const activeAdminWhere = {
  rol: RolUsuario.ADMIN,
  estado: EstadoUsuario.ACTIVO,
} as const;
