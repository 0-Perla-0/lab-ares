import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  bootstrapAdmin,
  type BootstrapAdminRepository,
} from "../../../src/bootstrap/admin-bootstrap";

const repository = {
  findActiveAdmin: vi.fn(),
  findByEmailOrCode: vi.fn(),
  create: vi.fn(),
  recover: vi.fn(),
};
const hashPassword = vi.fn(async () => "password-hash");
const input = {
  codigo: "ADMIN001",
  email: "admin@ares.local",
  password: "A-secure-password-123!",
};

describe("bootstrapAdmin", () => {
  beforeEach(() => vi.resetAllMocks());

  it("does not change data when an active admin already exists", async () => {
    repository.findActiveAdmin.mockResolvedValue({ id: 7 });

    await expect(run()).resolves.toEqual({ status: "existing", id: 7 });
    expect(hashPassword).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("creates the first administrator", async () => {
    repository.findActiveAdmin.mockResolvedValue(null);
    repository.findByEmailOrCode.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 8 });

    await expect(run()).resolves.toEqual({ status: "created", id: 8 });
    expect(repository.create).toHaveBeenCalledWith({
      codigo: input.codigo,
      email: input.email,
      passwordHash: "password-hash",
    });
  });

  it("recovers a matching inactive administrator", async () => {
    repository.findActiveAdmin.mockResolvedValue(null);
    repository.findByEmailOrCode.mockResolvedValue({
      id: 9,
      codigo: input.codigo,
      email: input.email,
    });
    repository.recover.mockResolvedValue({ id: 9 });

    await expect(run()).resolves.toEqual({ status: "recovered", id: 9 });
    expect(repository.recover).toHaveBeenCalledWith(9, {
      passwordHash: "password-hash",
    });
  });

  it("rejects collisions that refer to different users", async () => {
    repository.findActiveAdmin.mockResolvedValue(null);
    repository.findByEmailOrCode.mockResolvedValue({
      id: 10,
      codigo: "OTHER",
      email: input.email,
    });

    await expect(run()).rejects.toThrow("must identify the same user");
    expect(repository.recover).not.toHaveBeenCalled();
  });
});

function run() {
  return bootstrapAdmin(
    repository as unknown as BootstrapAdminRepository,
    input,
    hashPassword,
  );
}
