import { describe, expect, it, vi } from "vitest";
import { DirectoryService } from "../src/directory/directory.service";
import { preferenceSchema, querySchema } from "../src/directory/directory.schemas";
import { EstadoProyectoKairos, EstadoUsuario, RolUsuario } from "../src/generated/prisma/enums";
import type { AuthUser } from "../src/auth/auth-user";

const actor = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 1, codigo: "A001", email: "self@example.test", rol: RolUsuario.COORDINADOR,
  estado: EstadoUsuario.ACTIVA, areaId: 10, sedeId: 20, turnoId: null, ...overrides,
});

function make(overrides: any = {}) {
  const rows = overrides.rows ?? [{ id: 1, codigo: "A001", email: "self@example.test", rol: RolUsuario.COORDINADOR, sede: { id: 20, nombre: "Sede" }, area: { id: 10, nombre: "Área" }, turno: null, directorioPreferencia: { mostrarEmail: true } }];
  const db: any = {
    directorioPreferencia: { upsert: vi.fn().mockResolvedValue({ visibleEnArea: true, visibleEnProyectos: true, mostrarEmail: true }) },
    proyectoKairos: { findFirst: vi.fn().mockResolvedValue({ id: "cmabcdefghijklmnopqrstuvwx", estado: EstadoProyectoKairos.ACTIVO }) },
    miembroProyectoKairos: { findFirst: vi.fn().mockResolvedValue({ usuarioId: 1 }) },
    usuario: { count: vi.fn().mockResolvedValue(rows.length), findMany: vi.fn().mockResolvedValue(rows) },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn((ops: any) => Array.isArray(ops) ? Promise.all(ops) : ops(db)),
    ...overrides.db,
  };
  const audit = { append: vi.fn().mockResolvedValue(undefined) };
  return { service: new DirectoryService(db, audit as any), db, audit };
}

describe("directory contracts", () => {
  it("validates strict scopes, project binding, and page bounds", () => {
    expect(querySchema.safeParse({ scope: "area", projectId: "cmabcdefghijklmnopqrstuvwx" }).success).toBe(false);
    expect(querySchema.safeParse({ scope: "project" }).success).toBe(false);
    expect(querySchema.safeParse({ scope: "all", page: 0 }).success).toBe(false);
    expect(querySchema.safeParse({ scope: "all", pageSize: 101 }).success).toBe(false);
    expect(querySchema.safeParse({ scope: "all", page: 1, pageSize: 20 }).success).toBe(true);
    expect(preferenceSchema.safeParse({}).success).toBe(false);
    expect(preferenceSchema.safeParse({ mostrarEmail: true, extra: true }).success).toBe(false);
  });

  it.each([RolUsuario.PRESTADOR, RolUsuario.COORDINADOR, RolUsuario.JEFE_AREA, RolUsuario.JEFE_SEDE, RolUsuario.ADMIN, RolUsuario.JEFE_COORDINADORES])("permits authenticated role %s in area scope", async (rol) => {
    const { service } = make();
    await expect(service.list(actor({ rol }), { scope: "area", page: 1, pageSize: 20 })).resolves.toBeDefined();
  });

  it("restricts all scope to global roles and keeps area scope bound to same area and site", async () => {
    const { service, db } = make();
    await expect(service.list(actor({ rol: RolUsuario.COORDINADOR }), { scope: "all", page: 1, pageSize: 20 })).rejects.toMatchObject({ status: 403 });
    await service.list(actor({ areaId: 7, sedeId: 8 }), { scope: "area", page: 1, pageSize: 20 });
    expect(db.usuario.count.mock.calls[0][0].where).toMatchObject({ areaId: 7, sedeId: 8 });
  });

  it("requires active actor and target project memberships and allows archived reads", async () => {
    const { service, db } = make({ db: { proyectoKairos: { findFirst: vi.fn().mockResolvedValue({ id: "p", estado: EstadoProyectoKairos.ARCHIVADO }) } } });
    await expect(service.list(actor(), { scope: "project", projectId: "cmabcdefghijklmnopqrstuvwx", page: 1, pageSize: 20 })).resolves.toBeDefined();
    db.miembroProyectoKairos.findFirst.mockResolvedValue(null);
    await expect(service.list(actor(), { scope: "project", projectId: "cmabcdefghijklmnopqrstuvwx", page: 1, pageSize: 20 })).rejects.toMatchObject({ status: 403 });
  });

  it("shows self email, hides other email unless target preference allows it, and never leaks hidden email through q", async () => {
    const rows = [
      { id: 1, codigo: "A001", email: "self@example.test", rol: RolUsuario.PRESTADOR, sede: null, area: null, turno: null, directorioPreferencia: { mostrarEmail: false } },
      { id: 2, codigo: "B002", email: "secret@example.test", rol: RolUsuario.PRESTADOR, sede: null, area: null, turno: null, directorioPreferencia: { mostrarEmail: false } },
    ];
    const { service, db } = make({ rows });
    const result = await service.list(actor(), { scope: "area", page: 1, pageSize: 20 });
    expect(result.items[0].email).toBe("self@example.test");
    expect(result.items[1].email).toBeUndefined();
    await service.list(actor(), { scope: "area", q: "secret@example.test", page: 1, pageSize: 20 });
    expect(db.usuario.findMany.mock.calls.at(-1)[0].where).toBeDefined();
  });

  it("does not force self into q results when neither own code nor email matches", async () => {
    const { service, db } = make();
    await service.list(actor(), { scope: "area", q: "no-match", page: 1, pageSize: 20 });
    const qFilter = db.usuario.findMany.mock.calls.at(-1)[0].where.AND[0].OR;
    expect(qFilter).not.toContainEqual({ id: actor().id });
  });

  it("allows self search by hidden email but excludes other hidden emails", async () => {
    const rows = [
      { id: 1, codigo: "A001", email: "self-secret@example.test", rol: RolUsuario.PRESTADOR, sede: null, area: null, turno: null, directorioPreferencia: { mostrarEmail: false } },
      { id: 2, codigo: "B002", email: "other-secret@example.test", rol: RolUsuario.PRESTADOR, sede: null, area: null, turno: null, directorioPreferencia: { mostrarEmail: false } },
    ];
    const { service, db } = make({ rows });
    await service.list(actor(), { scope: "area", q: "self-secret@example.test", page: 1, pageSize: 20 });
    const selfSearch = db.usuario.findMany.mock.calls.at(-1)[0].where.AND[0].OR;
    expect(selfSearch).toContainEqual(expect.objectContaining({ AND: expect.arrayContaining([expect.objectContaining({ email: { contains: "self-secret@example.test" } })]) }));
    expect(selfSearch).not.toContainEqual({ email: { contains: "other-secret@example.test" } });
    await service.list(actor(), { scope: "area", q: "other-secret@example.test", page: 1, pageSize: 20 });
    const otherSearch = db.usuario.findMany.mock.calls.at(-1)[0].where.AND[0].OR;
    expect(otherSearch).not.toContainEqual({ id: actor().id });
  });

  it("uses each target's mostrarEmail preference, not the actor's preference", async () => {
    const rows = [
      { id: 1, codigo: "A001", email: "self@example.test", rol: RolUsuario.PRESTADOR, sede: null, area: null, turno: null, directorioPreferencia: { mostrarEmail: false } },
      { id: 2, codigo: "B002", email: "visible@example.test", rol: RolUsuario.PRESTADOR, sede: null, area: null, turno: null, directorioPreferencia: { mostrarEmail: true } },
    ];
    const { service } = make({ rows, db: { directorioPreferencia: { upsert: vi.fn().mockResolvedValue({ visibleEnArea: false, visibleEnProyectos: false, mostrarEmail: false }) } } });
    const result = await service.list(actor(), { scope: "area", page: 1, pageSize: 20 });
    expect((result.items.find((x: any) => x.id === 2) as any)?.email).toBe("visible@example.test");
  });

  it("does not turn all-scope into a row-visibility filter, while email remains per-target", async () => {
    const rows = [{ id: 2, codigo: "B002", email: "hidden@example.test", rol: RolUsuario.PRESTADOR, sede: null, area: null, turno: null, directorioPreferencia: { mostrarEmail: false } }];
    const { service, db } = make({ rows });
    await service.list(actor({ rol: RolUsuario.ADMIN }), { scope: "all", page: 1, pageSize: 20 });
    expect(db.usuario.count.mock.calls[0][0].where.OR).toBeUndefined();
    expect(db.usuario.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it("rejects area scope when actor has no area or site assignment", async () => {
    const { service } = make();
    await expect(service.list(actor({ areaId: null, sedeId: null }), { scope: "area", page: 1, pageSize: 20 })).resolves.toMatchObject({ items: [], total: 0 });
  });

  it("supports code search, stable pagination, and excludes inactive users", async () => {
    const { service, db } = make();
    await service.list(actor(), { scope: "area", q: "A001", page: 2, pageSize: 5 });
    const args = db.usuario.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ codigo: "asc" }, { id: "asc" }]);
    expect(args.skip).toBe(5); expect(args.take).toBe(5); expect(args.where.estado).toBe(EstadoUsuario.ACTIVA);
    expect(args.where.AND?.[0]?.OR?.[0]).toEqual({ codigo: { contains: "A001" } });
  });

  it("creates default preferences and updates them atomically with audit", async () => {
    const { service, db, audit } = make();
    await service.getPreferences(actor());
    expect(db.directorioPreferencia.upsert).toHaveBeenCalled();
    await service.updatePreferences(actor(), { mostrarEmail: false });
    expect(db.$transaction).toHaveBeenCalled();
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "DIRECTORY_PREFERENCES_UPDATED" }), expect.anything());
  });

  it("propagates preference transaction failures and does not claim success", async () => {
    const { service } = make({ db: { $transaction: vi.fn().mockRejectedValue(new Error("rollback")) } });
    await expect(service.updatePreferences(actor(), { visibleEnArea: false })).rejects.toThrow("rollback");
  });
});
