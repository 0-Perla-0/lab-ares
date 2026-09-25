import { describe, expect, it, vi } from "vitest";
import { AcademicService } from "../src/academic/academic.service";
import { RolUsuario, EstadoUsuario } from "../src/generated/prisma/enums";
import type { AuthUser } from "../src/auth/auth-user";

const user = (id: number, rol: RolUsuario, areaId: number | null, sedeId: number | null): AuthUser => ({ id, codigo: String(id), email: `${id}@x.test`, rol, estado: EstadoUsuario.ACTIVA, areaId, sedeId, turnoId: null });
function service(target = { id: 2, rol: RolUsuario.PRESTADOR, areaId: 10, sedeId: 20, estado: EstadoUsuario.ACTIVA }) {
  return new AcademicService({ usuario: { findUnique: vi.fn().mockResolvedValue(target) }, adscripcionAcademica: { findFirst: vi.fn().mockResolvedValue(null) } } as never);
}

describe("AcademicService authorization", () => {
  it.each([
    [RolUsuario.PRESTADOR, user(1, RolUsuario.PRESTADOR, 10, 20), 2],
    [RolUsuario.COORDINADOR, user(1, RolUsuario.COORDINADOR, 99, 20), 2],
    [RolUsuario.JEFE_SEDE, user(1, RolUsuario.JEFE_SEDE, 99, 99), 2],
  ])("returns uniform not found for out-of-scope %s", async (_role, actor, id) => {
    await expect(service().profile(id, actor)).rejects.toMatchObject({ code: "ACADEMIC_PROFILE_NOT_FOUND" });
  });
  it("allows global admin to read another user", async () => {
    await expect(service().profile(2, user(1, RolUsuario.ADMIN, null, null))).resolves.toBeNull();
  });
  it("does not enumerate inactive actor", async () => {
    await expect(service().profile(2, { ...user(1, RolUsuario.ADMIN, null, null), estado: EstadoUsuario.SUSPENDIDA })).rejects.toMatchObject({ code: "ACADEMIC_PROFILE_NOT_FOUND" });
  });
  it("pending listing selects a safe user projection", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 8, usuario: { id: 2, codigo: "P2", email: "p@test", rol: RolUsuario.PRESTADOR, estado: EstadoUsuario.ACTIVA, sedeId: 20, areaId: 10 } }]);
    const s = new AcademicService({ adscripcionAcademica: { findMany, count: vi.fn().mockResolvedValue(1) } } as never);
    const result = await s.pending(user(1, RolUsuario.ADMIN, null, null));
    expect(result.items[0].usuario).not.toHaveProperty("passwordHash"); expect(findMany.mock.calls[0][0].select.usuario.select).not.toHaveProperty("passwordHash");
  });
  it("history does not require a confirmed profile", async () => {
    const s = new AcademicService({ usuario: { findUnique: vi.fn().mockResolvedValue({ id: 2, areaId: 10, sedeId: 20, estado: EstadoUsuario.ACTIVA }) }, adscripcionAcademica: { findMany: vi.fn().mockResolvedValue([{ estado: "PENDIENTE_CONFIRMACION" }]), count: vi.fn().mockResolvedValue(1) } } as never);
    await expect(s.history(2, user(1, RolUsuario.COORDINADOR, 10, 20))).resolves.toMatchObject({ total: 1 });
  });
  it("profile queries only confirmed vigente records", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 7, estado: "CONFIRMADA", vigente: true });
    const s = new AcademicService({ usuario: { findUnique: vi.fn().mockResolvedValue({ id: 2, rol: RolUsuario.PRESTADOR, areaId: 10, sedeId: 20, estado: EstadoUsuario.ACTIVA }) }, adscripcionAcademica: { findFirst } } as never);
    await s.profile(2, user(1, RolUsuario.ADMIN, null, null));
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ usuarioId: 2, estado: "CONFIRMADA", vigente: true });
  });

  it("update creates a pending non-vigente request inside transaction", async () => {
    const create = vi.fn().mockResolvedValue({ estado: "PENDIENTE_CONFIRMACION", vigente: false });
    const tx: any = { $executeRaw: vi.fn(), usuario: { findUnique: vi.fn().mockResolvedValue({ estado: EstadoUsuario.ACTIVA, rol: RolUsuario.PRESTADOR }) }, institucionAcademica: { findUnique: vi.fn().mockResolvedValue({ id: 1, activa: true }) }, programaAcademico: { findUnique: vi.fn().mockResolvedValue({ id: 3, activa: true, unidadAcademica: { id: 2, activa: true, institucionId: 1 } }) }, unidadAcademica: { findUnique: vi.fn().mockResolvedValue(null) }, cohorteAcademica: { findUnique: vi.fn().mockResolvedValue(null) }, adscripcionAcademica: { findFirst: vi.fn().mockResolvedValue(null), create } };
    const s = new AcademicService({ $transaction: vi.fn((fn) => fn(tx)) } as never);
    await s.updateProfile(2, { institucionId: 1, unidadAcademicaId: null, programaAcademicoId: 3, cohorteId: null, inicio: "2026-01-01", fin: null }, 1);
    expect(create.mock.calls[0][0].data).toMatchObject({ estado: "PENDIENTE_CONFIRMACION", vigente: false }); expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it("update rejects a second pending request", async () => {
    const tx: any = { $executeRaw: vi.fn(), usuario: { findUnique: vi.fn().mockResolvedValue({ estado: EstadoUsuario.ACTIVA, rol: RolUsuario.PRESTADOR }) }, institucionAcademica: { findUnique: vi.fn().mockResolvedValue({ id: 1, activa: true }) }, programaAcademico: { findUnique: vi.fn().mockResolvedValue({ id: 3, activa: true, unidadAcademica: { id: 2, activa: true, institucionId: 1 } }) }, unidadAcademica: { findUnique: vi.fn().mockResolvedValue(null) }, cohorteAcademica: { findUnique: vi.fn().mockResolvedValue(null) }, adscripcionAcademica: { findFirst: vi.fn().mockResolvedValue({ id: 8, estado: "PENDIENTE_CONFIRMACION" }) } };
    const s = new AcademicService({ $transaction: vi.fn((fn) => fn(tx)) } as never);
    await expect(s.updateProfile(2, { institucionId: 1, unidadAcademicaId: null, programaAcademicoId: 3, cohorteId: null, inicio: "2026-01-01", fin: null }, 1)).rejects.toMatchObject({ code: "ACADEMIC_PENDING_REQUEST_EXISTS" });
  });

  it("confirm accepts and closes prior vigente record", async () => {
    const updateMany = vi.fn(); const update = vi.fn().mockResolvedValue({ estado: "CONFIRMADA", vigente: true });
    const item = { id: 8, usuarioId: 2, estado: "PENDIENTE_CONFIRMACION", vigente: false, inicio: new Date("2026-02-01") }; const refs = { ...item, institucion: { activa: true }, programaAcademico: { activa: true, unidadAcademica: { activa: true } }, unidadAcademica: null, cohorte: null };
    const tx: any = { $executeRaw: vi.fn(), usuario: { findUnique: vi.fn((a: any) => Promise.resolve(a.where.id === 1 ? { estado: EstadoUsuario.ACTIVA, rol: RolUsuario.ADMIN } : { estado: EstadoUsuario.ACTIVA, rol: RolUsuario.PRESTADOR })) }, adscripcionAcademica: { findUnique: vi.fn((a: any) => Promise.resolve(a.include ? refs : item)), findFirst: vi.fn().mockResolvedValue(null), updateMany, update } };
    const s = new AcademicService({ $transaction: vi.fn((fn) => fn(tx)) } as never);
    await s.confirm(8, 1, true); expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estado: "CONFIRMADA", vigente: true }) })); expect(updateMany).toHaveBeenCalled();
  });

  it("confirm rejects with vigente false and reason", async () => {
    const update = vi.fn().mockResolvedValue({ estado: "RECHAZADA", vigente: false }); const item = { id: 8, usuarioId: 2, estado: "PENDIENTE_CONFIRMACION", vigente: false, inicio: new Date("2026-02-01") }; const refs = { ...item, institucion: { activa: true }, programaAcademico: { activa: true, unidadAcademica: { activa: true } }, unidadAcademica: null, cohorte: null };
    const tx: any = { $executeRaw: vi.fn(), usuario: { findUnique: vi.fn((a: any) => Promise.resolve(a.where.id === 1 ? { estado: EstadoUsuario.ACTIVA, rol: RolUsuario.ADMIN } : { estado: EstadoUsuario.ACTIVA, rol: RolUsuario.PRESTADOR })) }, adscripcionAcademica: { findUnique: vi.fn((a: any) => Promise.resolve(a.include ? refs : item)), findFirst: vi.fn().mockResolvedValue(null), update } };
    const s = new AcademicService({ $transaction: vi.fn((fn) => fn(tx)) } as never); await s.confirm(8, 1, false, "No cumple"); expect(update.mock.calls[0][0].data).toMatchObject({ estado: "RECHAZADA", vigente: false, motivoRechazo: "No cumple" });
  });

  it("double confirm is a conflict after lock revalidation", async () => {
    const tx: any = { $executeRaw: vi.fn(), usuario: { findUnique: vi.fn().mockResolvedValue({ estado: EstadoUsuario.ACTIVA, rol: RolUsuario.ADMIN }) }, adscripcionAcademica: { findUnique: vi.fn().mockResolvedValue({ id: 8, usuarioId: 2, estado: "CONFIRMADA", vigente: true }) } };
    const s = new AcademicService({ $transaction: vi.fn((fn) => fn(tx)) } as never); await expect(s.confirm(8, 1, true)).rejects.toMatchObject({ code: "ACADEMIC_REQUEST_ALREADY_RESOLVED" }); expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it.each([EstadoUsuario.SUSPENDIDA, EstadoUsuario.BLOQUEADA, EstadoUsuario.DESACTIVADA])("inactive actor cannot update or list (%s)", async (estado) => {
    const tx: any = { $executeRaw: vi.fn(), usuario: { findUnique: vi.fn().mockResolvedValue({ estado }) } }; const s = new AcademicService({ usuario: tx.usuario, $transaction: vi.fn((fn) => fn(tx)) } as never); const actor = { ...user(1, RolUsuario.ADMIN, null, null), estado };
    await expect(s.updateProfile(2, { institucionId: 1, unidadAcademicaId: null, programaAcademicoId: 3, cohorteId: null, inicio: "2026-01-01", fin: null }, 1)).rejects.toMatchObject({ code: "ACADEMIC_PROFILE_NOT_FOUND" }); await expect(s.pending(actor)).rejects.toMatchObject({ code: "ACADEMIC_PROFILE_NOT_FOUND" });
  });

  it("history returns pending and historical records with pagination", async () => {
    const findMany = vi.fn().mockResolvedValue([{ estado: "PENDIENTE_CONFIRMACION" }]); const s = new AcademicService({ usuario: { findUnique: vi.fn().mockResolvedValue({ id: 2, areaId: 10, sedeId: 20, estado: EstadoUsuario.ACTIVA }) }, adscripcionAcademica: { findMany, count: vi.fn().mockResolvedValue(3) } } as never); const result = await s.history(2, user(1, RolUsuario.ADMIN, null, null), 2, 1); expect(result).toMatchObject({ page: 2, pageSize: 1, total: 3 }); expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 1, take: 1 });
  });

  it("chronology rejects equal start and start before open/current period", async () => {
    const tx: any = { $executeRaw: vi.fn(), usuario: { findUnique: vi.fn().mockResolvedValue({ estado: EstadoUsuario.ACTIVA, rol: RolUsuario.PRESTADOR }) }, institucionAcademica: { findUnique: vi.fn().mockResolvedValue({ id: 1, activa: true }) }, programaAcademico: { findUnique: vi.fn().mockResolvedValue({ id: 3, activa: true, unidadAcademica: { id: 2, activa: true, institucionId: 1 } }) }, unidadAcademica: { findUnique: vi.fn().mockResolvedValue(null) }, cohorteAcademica: { findUnique: vi.fn().mockResolvedValue(null) }, adscripcionAcademica: { findFirst: vi.fn().mockResolvedValue({ inicio: new Date("2026-01-01"), fin: null }) } }; const s = new AcademicService({ $transaction: vi.fn((fn) => fn(tx)) } as never); await expect(s.updateProfile(2, { institucionId: 1, unidadAcademicaId: null, programaAcademicoId: 3, cohorteId: null, inicio: "2026-01-01", fin: null }, 1)).rejects.toMatchObject({ code: "ACADEMIC_CHRONOLOGY_CONFLICT" });
  });

  it("createCatalog locks and rejects inactive parent", async () => { const tx: any = { $executeRaw: vi.fn(), institucionAcademica: { findUnique: vi.fn().mockResolvedValue({ activa: false }) }, unidadAcademica: { create: vi.fn() } }; const s = new AcademicService({ $transaction: vi.fn((fn) => fn(tx)) } as never); await expect(s.createCatalog("unidad", { nombre: "U", parentId: 4 })).rejects.toMatchObject({ code: "ACADEMIC_PARENT_INACTIVE" }); expect(tx.$executeRaw).toHaveBeenCalled(); });

  it("confirm rejects an inactive target after locking and re-reading it", async () => {
    const item = { id: 9, usuarioId: 2, estado: "PENDIENTE_CONFIRMACION", vigente: false, inicio: new Date("2026-02-01") }; const tx: any = { $executeRaw: vi.fn(), usuario: { findUnique: vi.fn((a: any) => Promise.resolve(a.where.id === 1 ? { estado: EstadoUsuario.ACTIVA, rol: RolUsuario.ADMIN } : { estado: EstadoUsuario.SUSPENDIDA, rol: RolUsuario.PRESTADOR })) }, adscripcionAcademica: { findUnique: vi.fn().mockResolvedValue(item) } }; const s = new AcademicService({ $transaction: vi.fn((fn) => fn(tx)) } as never); await expect(s.confirm(9, 1, true)).rejects.toMatchObject({ code: "ACADEMIC_REFERENCE_CHANGED" });
  });

  it("catalog parent is revalidated inside the transaction", async () => {
    const parent = { activa: true }; const findUnique = vi.fn().mockResolvedValue(parent); const tx: any = { $executeRaw: vi.fn(), institucionAcademica: { findUnique, }, unidadAcademica: { create: vi.fn().mockResolvedValue({ id: 5 }) } }; const s = new AcademicService({ $transaction: vi.fn((fn) => fn(tx)) } as never); await expect(s.createCatalog("unidad", { nombre: "U", parentId: 4 })).resolves.toBeDefined(); expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it("pending applies area scope and pagination to active targets", async () => {
    const findMany = vi.fn().mockResolvedValue([]); const count = vi.fn().mockResolvedValue(0); const s = new AcademicService({ adscripcionAcademica: { findMany, count } } as never); const result = await s.pending(user(1, RolUsuario.COORDINADOR, 10, 20), 3, 2); expect(result).toMatchObject({ page: 3, pageSize: 2, total: 0 }); expect(findMany.mock.calls[0][0].where.usuario).toMatchObject({ estado: EstadoUsuario.ACTIVA, areaId: 10 });
  });
});
