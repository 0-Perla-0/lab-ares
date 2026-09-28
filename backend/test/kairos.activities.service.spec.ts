import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KairosActivitiesService } from "../src/kairos/activities.service";
import { activitySchema, transitionSchema, reviewSchema, reopenSchema, commentSchema, submitSchema } from "../src/kairos/activities.schemas";
import { EstadoActividadKairos, EstadoArchivo, EstadoProyectoKairos, EstadoUsuario, RolMiembroProyectoKairos, RolUsuario } from "../src/generated/prisma/enums";
import type { AuthUser } from "../src/auth/auth-user";

const actor = (id = 1): AuthUser => ({ id, codigo: `U${id}`, email: `${id}@test.local`, rol: RolUsuario.COORDINADOR, estado: EstadoUsuario.ACTIVA, areaId: 1, sedeId: 1, turnoId: null });
const member = (usuarioId = 1, rol: RolMiembroProyectoKairos = RolMiembroProyectoKairos.PROPIETARIO) => ({ proyectoId: "p-1", usuarioId, rol, removedAt: null });
const activity = (state: EstadoActividadKairos = EstadoActividadKairos.PENDIENTE) => ({ id: "a-1", proyectoId: "p-1", title: "Actividad", description: null, startAt: null, dueAt: null, closedAt: null, priority: "MEDIA", complexity: "MEDIA", state, responsableId: 1, createdAt: new Date(), updatedAt: new Date(), responsable: { id: 1, codigo: "U1" }, participants: [] });

function make(overrides: any = {}) {
  const tx: any = {
    $executeRaw: vi.fn(),
    proyectoKairos: { findUnique: vi.fn().mockResolvedValue({ estado: EstadoProyectoKairos.ACTIVO }) },
    miembroProyectoKairos: { findFirst: vi.fn().mockResolvedValue(member()), findMany: vi.fn().mockResolvedValue([member()]) },
    usuario: { findUnique: vi.fn().mockResolvedValue({ id: 1, estado: EstadoUsuario.ACTIVA }), findMany: vi.fn().mockResolvedValue([{ id: 1 }]) },
    actividadKairos: { create: vi.fn().mockResolvedValue(activity()), update: vi.fn().mockResolvedValue(activity()), findUnique: vi.fn().mockResolvedValue({ ...activity(), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }), findFirst: vi.fn().mockResolvedValue({ ...activity(), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }), findMany: vi.fn().mockResolvedValue([activity()]), count: vi.fn().mockResolvedValue(1) },
    participanteActividadKairos: { deleteMany: vi.fn(), createMany: vi.fn(), create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    historialActividadKairos: { create: vi.fn().mockResolvedValue({ id: "h-1" }), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    entregaEvidenciaKairos: { aggregate: vi.fn().mockResolvedValue({ _max: { version: 0 } }), create: vi.fn().mockResolvedValue({ id: "e-1", version: 1 }), findUnique: vi.fn().mockResolvedValue({ archivoId: "f-1" }), findFirst: vi.fn().mockResolvedValue({ archivoId: "f-1" }), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    comentarioActividadKairos: { create: vi.fn().mockResolvedValue({ id: "c-1", body: "ok" }), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  };
  const merge = (base: any, extra: any): any => Object.fromEntries(Object.keys({ ...base, ...extra }).map((k) => [k, base[k] && extra?.[k] && typeof base[k] === "object" && typeof extra[k] === "object" ? merge(base[k], extra[k]) : (extra?.[k] ?? base[k])]));
  Object.assign(tx, merge(tx, overrides.tx ?? {}));
  const db: any = { $transaction: vi.fn((fn: any) => fn(tx)), $executeRaw: tx.$executeRaw, miembroProyectoKairos: tx.miembroProyectoKairos, actividadKairos: { ...tx.actividadKairos, findMany: vi.fn().mockResolvedValue([activity()]) }, comentarioActividadKairos: tx.comentarioActividadKairos, historialActividadKairos: tx.historialActividadKairos, entregaEvidenciaKairos: tx.entregaEvidenciaKairos };
  const audit = { append: vi.fn().mockResolvedValue(undefined) };
  const storage = { downloadUrl: vi.fn().mockResolvedValue("https://download") };
  const gamification = overrides.gamification ?? { awardKairos: vi.fn().mockResolvedValue(undefined), reverseKairos: vi.fn().mockResolvedValue(undefined) };
  return { s: new KairosActivitiesService(db, audit as any, storage as any, gamification as any), db, tx, audit, storage, gamification };
}

describe("Kairos activities contracts", () => {
  it("keeps evidence and history foreign keys restrictive and indexed", () => {
    const sql = readFileSync(resolve(process.cwd(), "prisma/migrations/20260925220000_kairos_activities/migration.sql"), "utf8");
    expect(sql).toContain("EntregaEvidenciaKairos_archivoId_fkey");
    expect(sql).toContain("HistorialActividadKairos_evidenceId_fkey");
    expect(sql).toContain("INDEX `EntregaEvidenciaKairos_archivoId_idx`");
    expect(sql).toContain("INDEX `HistorialActividadKairos_evidenceId_idx`");
  });
  it("rejects unknown fields and invalid ids/bodies", () => {
    expect(() => activitySchema.parse({ title: "x", responsableId: 1, extra: true })).toThrow();
    expect(() => transitionSchema.parse({ state: "TERMINADA" })).toThrow();
    expect(() => reviewSchema.parse({ state: "REQUIERE_CORRECCION" })).not.toThrow();
    expect(() => reopenSchema.parse({ reason: "" })).toThrow();
    expect(() => commentSchema.parse({ body: "" })).toThrow();
    const valid = "0123456789abcdef0123456789abcd";
    expect(submitSchema.safeParse({ archivoId: valid }).success).toBe(true);
    expect(submitSchema.safeParse({ archivoId: valid.slice(0, 29) }).success).toBe(false);
    expect(submitSchema.safeParse({ archivoId: valid.toUpperCase() }).success).toBe(false);
    expect(submitSchema.safeParse({ archivoId: `${valid.slice(0, 29)}g` }).success).toBe(false);
  });

  it("creates only for an active owner/subleader and validates responsible membership", async () => {
    const { s, tx } = make({ tx: { miembroProyectoKairos: { findFirst: vi.fn().mockResolvedValue(member(1, RolMiembroProyectoKairos.SUBLIDER)) } } });
    await expect(s.create(actor(), "p-1", { title: "Nueva", responsableId: 1 })).resolves.toBeDefined();
    expect(tx.actividadKairos.create).toHaveBeenCalled();
    const { s: denied } = make({ tx: { miembroProyectoKairos: { findFirst: vi.fn().mockResolvedValue(member(1, RolMiembroProyectoKairos.OBSERVADOR)) } } });
    await expect(denied.create(actor(), "p-1", { title: "Nueva", responsableId: 1 })).rejects.toMatchObject({ code: "KAIROS_PROJECT_NOT_FOUND" });
  });

  it("rejects inactive or non-member responsible and participants", async () => {
    const { s } = make({ tx: { usuario: { findMany: vi.fn().mockResolvedValue([]) } } });
    await expect(s.create(actor(), "p-1", { title: "Nueva", responsableId: 9 })).rejects.toMatchObject({ code: "KAIROS_MEMBER_INVALID" });
  });

  it("rejects an inactive or foreign participant instead of trusting participantIds", async () => {
    const { s, tx } = make({ tx: {
      usuario: { findUnique: vi.fn().mockImplementation(({ where }: any) => Promise.resolve({ id: where.id, estado: where.id === 9 ? EstadoUsuario.SUSPENDIDA : EstadoUsuario.ACTIVA })) },
      miembroProyectoKairos: { findFirst: vi.fn().mockImplementation(({ where }: any) => Promise.resolve(where.usuarioId === 9 ? null : member(where.usuarioId))) },
    } });
    await expect(s.create(actor(), "p-1", { title: "Nueva", responsableId: 1, participantIds: [9] })).rejects.toMatchObject({ code: "KAIROS_MEMBER_INVALID" });
    expect(tx.actividadKairos.create).not.toHaveBeenCalled();
  });

  it("lists and derives vencida without persisting it; closed activities are never overdue", async () => {
    const old = { ...activity(), dueAt: new Date(Date.now() - 60_000), state: EstadoActividadKairos.PENDIENTE };
    const { s, tx } = make({ tx: { actividadKairos: { findMany: vi.fn().mockResolvedValue([old, { ...old, state: EstadoActividadKairos.TERMINADA }]) } } });
    const result = await s.list(actor(), "p-1");
    expect(result.items[0].vencida).toBe(true); expect(result.items[1].vencida).toBe(false);
    expect(result.total).toBe(1);
    expect(tx.actividadKairos.findMany.mock.calls[0][0].where).toEqual({ proyectoId: "p-1" });
  });

  it("bounds activity list page and pageSize while returning total", async () => {
    const { s, tx } = make({ tx: { actividadKairos: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(125) } } });
    await expect(s.list(actor(), "p-1", 0, 500)).resolves.toMatchObject({ items: [], total: 125, page: 1, pageSize: 100 });
    expect(tx.actividadKairos.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100 }));
  });

  it.each([[EstadoActividadKairos.PENDIENTE, EstadoActividadKairos.EN_PROGRESO], [EstadoActividadKairos.EN_PROGRESO, EstadoActividadKairos.BLOQUEADA], [EstadoActividadKairos.EN_PROGRESO, EstadoActividadKairos.EN_REVISION], [EstadoActividadKairos.REQUIERE_CORRECCION, EstadoActividadKairos.EN_PROGRESO]])("accepts transition %s -> %s", async (from, to) => {
    const { s, tx } = make({ tx: { actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(from), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) } } });
    await expect(s.transition(actor(), "p-1", "a-1", to)).resolves.toBeDefined(); expect(tx.actividadKairos.update).toHaveBeenCalled();
  });

  it.each([[EstadoActividadKairos.PENDIENTE, EstadoActividadKairos.TERMINADA], [EstadoActividadKairos.EN_PROGRESO, EstadoActividadKairos.TERMINADA], [EstadoActividadKairos.TERMINADA, EstadoActividadKairos.PENDIENTE]])("rejects direct or illegal transition %s -> %s", async (from, to) => {
    const { s } = make({ tx: { actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(from), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) } } });
    await expect(s.transition(actor(), "p-1", "a-1", to)).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_TRANSITION_INVALID" });
  });

  it("updates only pending activities and prevents observer read-only mutations", async () => {
    const { s } = make({ tx: { actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(EstadoActividadKairos.EN_PROGRESO), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) } } });
    await expect(s.update(actor(), "p-1", "a-1", { title: "edited" })).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_EDIT_FORBIDDEN" });
    const { s: observer } = make({ tx: { miembroProyectoKairos: { findFirst: vi.fn().mockResolvedValue(member(1, RolMiembroProyectoKairos.OBSERVADOR)) } } });
    await expect(observer.comment(actor(), "p-1", "a-1", "no")).rejects.toMatchObject({ code: "KAIROS_COMMENT_FORBIDDEN" });
  });

  it("submits only from progress/correction, requires available file, and versions evidence", async () => {
    const { s, tx } = make({ tx: { actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(EstadoActividadKairos.EN_PROGRESO), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) }, archivo: { findUnique: vi.fn().mockResolvedValue({ id: "f-1", status: EstadoArchivo.DISPONIBLE, propietarioId: 1 }) } } });
    await expect(s.submit(actor(), "p-1", "a-1", "f-1", "entrega")).resolves.toMatchObject({ version: 1 });
    expect(tx.actividadKairos.update).toHaveBeenCalledWith(expect.objectContaining({ data: { state: EstadoActividadKairos.EN_REVISION } }));
  });

  it("rejects an available file that is not owned by the submitting actor", async () => {
    const { s } = make({ tx: {
      actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(EstadoActividadKairos.EN_PROGRESO), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) },
      archivo: { findUnique: vi.fn().mockResolvedValue({ id: "foreign", status: EstadoArchivo.DISPONIBLE, propietarioId: 99 }) },
    } });
    await expect(s.submit(actor(), "p-1", "a-1", "foreign")).rejects.toMatchObject({ code: "KAIROS_EVIDENCE_INVALID" });
  });

  it("requires distinct owner/subleader reviewer and a correction comment", async () => {
    const { s } = make({ tx: { actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(EstadoActividadKairos.EN_REVISION), responsableId: 2, proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) } } });
    await expect(s.review(actor(), "p-1", "a-1", EstadoActividadKairos.REQUIERE_CORRECCION)).rejects.toMatchObject({ code: "KAIROS_REVIEW_COMMENT_REQUIRED" });
    const { s: responsible } = make({ tx: { actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(EstadoActividadKairos.EN_REVISION), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) }, miembroProyectoKairos: { findFirst: vi.fn().mockResolvedValue(member(1, RolMiembroProyectoKairos.COLABORADOR)) } } });
    await expect(responsible.review(actor(), "p-1", "a-1", EstadoActividadKairos.TERMINADA, "ok")).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_REVIEW_INVALID" });
  });

  it("awards the responsible user only after an independent reviewer approves completion", async () => {
    const reviewed = { ...activity(EstadoActividadKairos.EN_REVISION), responsableId: 2, proyecto: { estado: EstadoProyectoKairos.ACTIVO } };
    const { s, tx, gamification } = make({ tx: { actividadKairos: { findFirst: vi.fn().mockResolvedValue(reviewed) } } });
    await expect(s.review(actor(), "p-1", "a-1", EstadoActividadKairos.TERMINADA, "approved")).resolves.toBeDefined();
    expect(gamification.awardKairos).toHaveBeenCalledWith(tx, { activityId: "a-1", userId: 2, actorId: 1, historyId: "h-1" });
  });

  it("reopens closed activities only with a reason and appends history", async () => {
    const { s, tx, gamification } = make({ tx: { actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(EstadoActividadKairos.TERMINADA), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) } } });
    await expect(s.reopen(actor(), "p-1", "a-1", "needs correction")).resolves.toBeDefined();
    expect(tx.historialActividadKairos.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ comment: "needs correction" }) }));
    expect(gamification.reverseKairos).toHaveBeenCalledWith(tx, { activityId: "a-1", actorId: 1, historyId: "h-1", reason: "needs correction" });
  });

  it("denies suspended actors consistently across activity operations", async () => {
    const suspended = { ...actor(), estado: EstadoUsuario.SUSPENDIDA };
    const { s } = make({ tx: { actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(EstadoActividadKairos.EN_REVISION), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) } } });
    await expect(s.transition(suspended, "p-1", "a-1", EstadoActividadKairos.EN_PROGRESO)).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_NOT_FOUND" });
    await expect(s.submit(suspended, "p-1", "a-1", "f-1")).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_NOT_FOUND" });
    await expect(s.review(suspended, "p-1", "a-1", EstadoActividadKairos.TERMINADA, "ok")).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_NOT_FOUND" });
    await expect(s.reopen(suspended, "p-1", "a-1", "reason")).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_NOT_FOUND" });
    await expect(s.comment(suspended, "p-1", "a-1", "x")).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_NOT_FOUND" });
    await expect(s.history(suspended, "p-1", "a-1")).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_NOT_FOUND" });
    await expect(s.evidenceDownload(suspended, "p-1", "a-1", "e-1")).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_NOT_FOUND" });
  });

  it("allows archived project reads for active members and locks authorization", async () => {
    const { s, tx } = make({ tx: { actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(), proyecto: { estado: EstadoProyectoKairos.ARCHIVADO } }) } } });
    await expect(s.get(actor(), "p-1", "a-1")).resolves.toMatchObject({ proyecto: { estado: EstadoProyectoKairos.ARCHIVADO } });
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it("allows archived list/history/download but blocks every mutation", async () => {
    const archived = { ...activity(), proyecto: { estado: EstadoProyectoKairos.ARCHIVADO } };
    const { s, tx } = make({ tx: {
      actividadKairos: { findFirst: vi.fn().mockResolvedValue(archived), findMany: vi.fn().mockResolvedValue([archived]) },
    } });
    await expect(s.list(actor(), "p-1")).resolves.toMatchObject({ total: 1 });
    await expect(s.history(actor(), "p-1", "a-1")).resolves.toMatchObject({ items: [], total: 0 });
    await expect(s.evidenceDownload(actor(), "p-1", "a-1", "e-1")).resolves.toBe("https://download");
    await expect(s.transition(actor(), "p-1", "a-1", EstadoActividadKairos.EN_PROGRESO)).rejects.toMatchObject({ kind: "CONFLICT", code: "KAIROS_PROJECT_ARCHIVED" });
    await expect(s.comment(actor(), "p-1", "a-1", "blocked")).rejects.toMatchObject({ kind: "CONFLICT", code: "KAIROS_PROJECT_ARCHIVED" });
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it("keeps comments/history append-only and scopes evidence download", async () => {
    const { s, tx, storage } = make();
    await s.comment(actor(), "p-1", "a-1", "progress"); await s.history(actor(), "p-1", "a-1"); await s.evidenceDownload(actor(), "p-1", "a-1", "e-1");
    expect(tx.comentarioActividadKairos.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ body: "progress", authorId: 1 }) }));
    expect(storage.downloadUrl).toHaveBeenCalled();
  });

  it("requires evidence to belong to the requested activity", async () => {
    const { s } = make({ tx: { entregaEvidenciaKairos: { findFirst: vi.fn().mockResolvedValue(null) } } });
    await expect(s.evidenceDownload(actor(), "p-1", "a-1", "e-from-other-activity")).rejects.toMatchObject({ code: "KAIROS_EVIDENCE_NOT_FOUND" });
  });

  it("requests the storage URL only after the evidence transaction has completed", async () => {
    const events: string[] = [];
    const { s, db, tx, storage } = make();
    db.$transaction.mockImplementation(async (fn: any) => { const result = await fn({ ...tx, $executeRaw: vi.fn(), actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) }, miembroProyectoKairos: { findFirst: vi.fn().mockResolvedValue(member()) }, entregaEvidenciaKairos: { findFirst: vi.fn().mockResolvedValue({ archivoId: "f-1" }) } }); events.push("committed"); return result; });
    storage.downloadUrl.mockImplementation(async () => { events.push("storage"); return "https://download"; });
    await s.evidenceDownload(actor(), "p-1", "a-1", "e-1");
    expect(events).toEqual(["committed", "storage"]);
  });

  it("rejects a project/activity route mismatch for detail, mutation, comment, and download", async () => {
    const { s } = make({ tx: { actividadKairos: { findFirst: vi.fn().mockImplementation(({ where }: any) => where.proyectoId === "wrong-project" ? null : { ...activity(), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) } } });
    await expect(s.get(actor(), "wrong-project", "a-1")).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_NOT_FOUND" });
    await expect(s.transition(actor(), "wrong-project", "a-1", EstadoActividadKairos.EN_PROGRESO)).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_NOT_FOUND" });
    await expect(s.comment(actor(), "wrong-project", "a-1", "x")).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_NOT_FOUND" });
    await expect(s.evidenceDownload(actor(), "wrong-project", "a-1", "e-1")).rejects.toMatchObject({ code: "KAIROS_ACTIVITY_NOT_FOUND" });
  });

  it("writes comments and their audit event in one transaction", async () => {
    const { s, db, audit } = make();
    await s.comment(actor(), "p-1", "a-1", "comment");
    expect(db.$transaction).toHaveBeenCalled();
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({ resource: "KAIROS_ACTIVITY" }), expect.anything());
  });

  it("binds evidence and comment reads to the locked project/activity and clamps pagination", async () => {
    const { s, tx } = make({ tx: {
      actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) },
      entregaEvidenciaKairos: { findMany: vi.fn().mockResolvedValue([{ id: "e-1", version: 1, comment: null, createdAt: new Date(), author: { id: 1, codigo: "U1" }, archivo: { id: "f", originalName: "x.pdf", detectedMime: "application/pdf", sizeBytes: BigInt(5), status: EstadoArchivo.DISPONIBLE, createdAt: new Date(), updatedAt: new Date() } }]), count: vi.fn().mockResolvedValue(1) },
      comentarioActividadKairos: { findMany: vi.fn().mockResolvedValue([{ id: "c-1", body: "ok", createdAt: new Date(), author: { id: 1, codigo: "U1" } }]), count: vi.fn().mockResolvedValue(1) },
    } });
    await expect(s.evidenceList(actor(), "p-1", "a-1", 0, 500)).resolves.toMatchObject({ total: 1, page: 1, pageSize: 100 });
    await expect(s.comments(actor(), "p-1", "a-1", 0, 500)).resolves.toMatchObject({ total: 1, page: 1, pageSize: 100 });
    expect(tx.entregaEvidenciaKairos.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { actividadId: "a-1" }, skip: 0, take: 100, orderBy: [{ createdAt: "asc" }, { version: "asc" }] }));
    expect(tx.comentarioActividadKairos.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { actividadId: "a-1" }, skip: 0, take: 100, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }));
  });

  it("minimizes authors and never leaks storage keys from evidence/comments", async () => {
    const { s, tx } = make({ tx: {
      actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) },
      entregaEvidenciaKairos: { findMany: vi.fn().mockResolvedValue([{ id: "e", version: 1, comment: null, createdAt: new Date(), author: { id: 1, codigo: "U1" }, archivo: { id: "f", originalName: "x", detectedMime: "application/pdf", sizeBytes: BigInt(1), status: EstadoArchivo.DISPONIBLE, createdAt: new Date(), updatedAt: new Date() } }]), count: vi.fn().mockResolvedValue(1) },
      comentarioActividadKairos: { findMany: vi.fn().mockResolvedValue([{ id: "c", body: "ok", createdAt: new Date(), author: { id: 1, codigo: "U1" } }]), count: vi.fn().mockResolvedValue(1) },
    } });
    const evidence = await s.evidenceList(actor(), "p-1", "a-1");
    const comments = await s.comments(actor(), "p-1", "a-1");
    expect(JSON.stringify(evidence)).not.toMatch(/objectKey|quarantineKey|passwordHash|email/);
    expect(JSON.stringify(comments)).not.toMatch(/objectKey|quarantineKey|passwordHash|email/);
    const evidenceQuery = tx.entregaEvidenciaKairos.findMany.mock.calls[0][0];
    const commentsQuery = tx.comentarioActividadKairos.findMany.mock.calls[0][0];
    expect(JSON.stringify(evidenceQuery.select)).not.toMatch(/objectKey|quarantineKey|passwordHash|email/);
    expect(JSON.stringify(commentsQuery.select)).not.toMatch(/objectKey|quarantineKey|passwordHash|email/);
  });

  it("keeps history read scoped and explicitly selected", async () => {
    const { s, tx } = make({ tx: {
      actividadKairos: { findFirst: vi.fn().mockResolvedValue({ ...activity(), proyecto: { estado: EstadoProyectoKairos.ACTIVO } }) },
      historialActividadKairos: { findMany: vi.fn().mockResolvedValue([{ id: "h", fromState: "PENDIENTE", toState: "EN_PROGRESO", comment: null, createdAt: new Date(), actor: { id: 1, codigo: "U1" } }]), count: vi.fn().mockResolvedValue(1) },
    } });
    await expect(s.history(actor(), "p-1", "a-1")).resolves.toMatchObject({ total: 1, page: 1, pageSize: 50, items: expect.any(Array) });
    expect(tx.historialActividadKairos.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { actividadId: "a-1" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: 0, take: 50 }));
    expect(tx.historialActividadKairos.findMany.mock.calls[0][0].select).toBeDefined();
  });

  it("bounds history pagination and returns total for archived activities", async () => {
    const archived = { ...activity(), proyecto: { estado: EstadoProyectoKairos.ARCHIVADO } };
    const { s, tx } = make({ tx: {
      actividadKairos: { findFirst: vi.fn().mockResolvedValue(archived) },
      historialActividadKairos: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(101) },
    } });
    await expect(s.history(actor(), "p-1", "a-1", 0, 500)).resolves.toMatchObject({ total: 101, page: 1, pageSize: 100 });
    expect(tx.historialActividadKairos.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }));
    const query = tx.historialActividadKairos.findMany.mock.calls[0][0];
    expect(JSON.stringify(query.select)).not.toMatch(/passwordHash|email|objectKey|quarantineKey/);
  });
});
