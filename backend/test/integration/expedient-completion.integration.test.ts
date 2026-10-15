import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { DocumentsService } from "../../src/documents/documents.service";
import { KairosActivitiesService } from "../../src/kairos/activities.service";
import { AuditService } from "../../src/auth/audit.service";
import { FeaturePoliciesService } from "../../src/common/domain/feature-policies.service";
import { DomainTransaction } from "../../src/common/domain/domain-transaction";
import { QueueMonitorWorker } from "../../src/operations/queue-monitor.worker";

const url = process.env.DATABASE_URL;
if (!url || !/_(test|ci)$/.test(new URL(url).pathname))
  throw new Error(
    "Expedient acceptance requires a dedicated _test/_ci database",
  );
const config = new ConfigService({ DATABASE_URL: url });
const first = new PrismaService(config),
  second = new PrismaService(config);
const audit = new AuditService(first);
const features = new FeaturePoliciesService(first, config);
const documents = new DocumentsService(first, {} as any, audit, features);
const replica = new DocumentsService(
  second,
  {} as any,
  new AuditService(second),
  new FeaturePoliciesService(second, config),
);
const suffix = randomUUID().slice(0, 8);
let actor: any, subject: any, authority: any, academicId: number;
const key = () => `expedient-${randomUUID()}`;
async function file(sizeBytes = 1024n) {
  const id = randomUUID().replaceAll("-", "").slice(0, 30);
  return first.archivo.create({
    data: {
      id,
      propietarioId: subject.id,
      originalName: "synthetic.pdf",
      sizeBytes,
      detectedMime: "application/pdf",
      objectKey: `synthetic/${id}`,
      quarantineKey: `synthetic/quarantine/${id}`,
      status: "DISPONIBLE",
    },
  });
}
async function requirement() {
  return first.requisitoDocumento.create({
    data: {
      usuarioId: subject.id,
      codigo: key(),
      nombre: "Synthetic requirement",
    },
  });
}
describe("expedient and Kairos durable boundaries on MariaDB", () => {
  beforeAll(async () => {
    const sede = await first.sede.create({
      data: { nombre: `expedient-${suffix}` },
    });
    const area = await first.area.create({
      data: { nombre: "Expedient", sedeId: sede.id },
    });
    const create = (label: string, rol: "ADMIN" | "PRESTADOR") =>
      first.usuario.create({
        data: {
          codigo: `expedient-${label}-${suffix}`,
          email: `expedient-${label}-${suffix}@example.test`,
          passwordHash: "non-login-fixture",
          rol,
          estado: "ACTIVA",
          sedeId: sede.id,
          areaId: area.id,
        },
      });
    actor = await create("admin", "ADMIN");
    authority = await create("authority", "ADMIN");
    subject = await create("subject", "PRESTADOR");
  });
  afterAll(async () => {
    await first.$disconnect();
    await second.$disconnect();
  });
  it("requires academic coverage before formalization, without blocking account activation", async () => {
    await expect(
      documents.formalize(actor, key(), {
        usuarioId: subject.id,
        inicio: "2026-10-12",
      }),
    ).rejects.toMatchObject({ code: "ACADEMIC_FORMALIZATION_REQUIRED" });
    expect(
      (await first.usuario.findUniqueOrThrow({ where: { id: subject.id } }))
        .estado,
    ).toBe("ACTIVA");
    const institution = await first.institucionAcademica.create({
      data: { nombre: `expedient-${suffix}` },
    });
    const unit = await first.unidadAcademica.create({
      data: { nombre: "Unit", institucionId: institution.id },
    });
    const program = await first.programaAcademico.create({
      data: { nombre: "Program", unidadAcademicaId: unit.id },
    });
    academicId = (
      await first.adscripcionAcademica.create({
        data: {
          usuarioId: subject.id,
          institucionId: institution.id,
          programaAcademicoId: program.id,
          inicio: new Date("2026-01-01"),
          estado: "CONFIRMADA",
          vigente: true,
        },
      })
    ).id;
  });
  it("serializes competing authorities and preserves one immutable formalization", async () => {
    const input = { usuarioId: subject.id, inicio: "2026-10-12" };
    const attempts = await Promise.allSettled([
      documents.formalize(actor, key(), input),
      replica.formalize(authority, key(), input),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failed = attempts.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(failed.reason.code).toBe("EXPEDIENT_ALREADY_FORMALIZED");
    expect(
      await first.formalizacionExpediente.count({
        where: { usuarioId: subject.id },
      }),
    ).toBe(1);
    expect(
      await first.notification.count({
        where: { userId: subject.id, type: "EXPEDIENT_FORMALIZED" },
      }),
    ).toBe(1);
  });
  it("rolls back formalization and receipt when audit fails", async () => {
    const failing = new DocumentsService(
      first,
      {} as any,
      {
        append: async () => {
          throw new Error("forced rollback");
        },
      } as any,
    );
    const intent = key();
    await expect(
      failing.formalize(actor, intent, {
        usuarioId: subject.id,
        inicio: "2026-10-13",
      }),
    ).rejects.toThrow("forced rollback");
    expect(
      await first.formalizacionExpediente.count({
        where: { usuarioId: subject.id, inicio: new Date("2026-10-13") },
      }),
    ).toBe(0);
    expect(
      await first.domainOperation.count({
        where: { actorId: actor.id, key: intent },
      }),
    ).toBe(0);
  });
  it("creates one document version across independent replicas and replays without a second audit", async () => {
    const req = await requirement(),
      f = await file(),
      intent = key();
    const input = { requisitoId: req.id, archivoId: f.id };
    const results = await Promise.all([
      documents.upload(subject, input, intent),
      replica.upload(subject, input, intent),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(
      await first.documentoVersion.count({ where: { requisitoId: req.id } }),
    ).toBe(1);
    expect(
      await first.auditEvent.count({
        where: {
          actorId: subject.id,
          action: "DOCUMENT_VERSION_UPLOADED",
          correlationId: results[0].id,
        },
      }),
    ).toBe(1);
    await expect(
      documents.upload(
        subject,
        { ...input, archivoId: "f".repeat(30) },
        intent,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });
  it("rejects files above the 10 MiB module ceiling even if storage marks them clean", async () => {
    const req = await requirement(),
      f = await file(10n * 1024n * 1024n + 1n);
    await expect(
      documents.upload(
        subject,
        { requisitoId: req.id, archivoId: f.id },
        key(),
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_FILE_TOO_LARGE" });
    expect(
      await first.documentoVersion.count({ where: { requisitoId: req.id } }),
    ).toBe(0);
  });
  it("preserves authorized replay when uploads pause but blocks new work", async () => {
    const req = await requirement(),
      f = await file(),
      intent = key(),
      input = { requisitoId: req.id, archivoId: f.id };
    const committed = await documents.upload(subject, input, intent);
    const policyKey = "DOCUMENTS.UPLOAD";
    const old = await first.featurePolicy.findUnique({
      where: { module: policyKey },
    });
    await first.featurePolicy.upsert({
      where: { module: policyKey },
      create: {
        module: policyKey,
        enabled: false,
        sedeIds: [],
        areaIds: [],
        userIds: [],
        reason: "Synthetic pause",
        changedById: actor.id,
      },
      update: { enabled: false },
    });
    try {
      expect(await replica.upload(subject, input, intent)).toEqual(committed);
      await expect(
        documents.upload(subject, input, key()),
      ).rejects.toMatchObject({ code: "FEATURE_OUTSIDE_PILOT" });
    } finally {
      if (old)
        await first.featurePolicy.update({
          where: { module: policyKey },
          data: { enabled: old.enabled },
        });
      else await first.featurePolicy.delete({ where: { module: policyKey } });
    }
  });
  it("does not replay private document receipts after scope changes", async () => {
    const req = await requirement(),
      f = await file(),
      intent = key(),
      input = { requisitoId: req.id, archivoId: f.id };
    const uploaded = await documents.upload(subject, input, key());
    const coordinator = await first.usuario.update({
      where: { id: authority.id },
      data: { rol: "COORDINADOR" },
    });
    await documents.review(
      coordinator,
      uploaded.id,
      { estado: "AUTORIZADO" },
      intent,
    );
    await first.usuario.update({
      where: { id: subject.id },
      data: { areaId: null },
    });
    try {
      await expect(
        replica.review(
          coordinator,
          uploaded.id,
          { estado: "AUTORIZADO" },
          intent,
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    } finally {
      await first.usuario.update({
        where: { id: subject.id },
        data: { areaId: subject.areaId },
      });
    }
  });
  it("deduplicates Kairos comments and denies replay after membership removal", async () => {
    const project = await first.proyectoKairos.create({
      data: {
        nombre: `project-${suffix}`,
        creadoPorId: actor.id,
        estado: "ACTIVO",
      },
    });
    await first.miembroProyectoKairos.create({
      data: { proyectoId: project.id, usuarioId: actor.id, rol: "PROPIETARIO" },
    });
    const activity = await first.actividadKairos.create({
      data: {
        proyectoId: project.id,
        title: "Synthetic activity",
        responsableId: actor.id,
      },
    });
    const one = new KairosActivitiesService(first, audit, {} as any),
      two = new KairosActivitiesService(
        second,
        new AuditService(second),
        {} as any,
      );
    const intent = key();
    const results = await Promise.all([
      one.comment(
        actor,
        project.id,
        activity.id,
        "Synthetic private comment",
        intent,
      ),
      two.comment(
        actor,
        project.id,
        activity.id,
        "Synthetic private comment",
        intent,
      ),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(
      await first.comentarioActividadKairos.count({
        where: { actividadId: activity.id },
      }),
    ).toBe(1);
    await first.miembroProyectoKairos.update({
      where: {
        proyectoId_usuarioId: { proyectoId: project.id, usuarioId: actor.id },
      },
      data: { removedAt: new Date() },
    });
    await expect(
      two.comment(
        actor,
        project.id,
        activity.id,
        "Synthetic private comment",
        intent,
      ),
    ).rejects.toMatchObject({ code: "KAIROS_PROJECT_NOT_FOUND" });
  });
  it("commits an in-flight write before freeze and rejects subsequent work", async () => {
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const continueWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = new DomainTransaction(first).run(
      actor,
      key(),
      { action: "FREEZE_PROBE" },
      async () => {
        entered();
        await continueWrite;
        return { completed: true };
      },
    );
    await ready;
    const freeze = second.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE RecoveryWriteBarrier SET active = true WHERE id = 'global'`;
    });
    release();
    try {
      expect(await write).toEqual({ completed: true });
      await freeze;
      await expect(
        documents.formalize(actor, key(), {
          usuarioId: subject.id,
          inicio: "2026-10-14",
        }),
      ).rejects.toMatchObject({ code: "RECOVERY_WRITE_BARRIER_ACTIVE" });
    } finally {
      await first.recoveryWriteBarrier.update({
        where: { id: "global" },
        data: { active: false },
      });
    }
  });
  it("retains the confirmed academic reference used by the snapshot", async () => {
    expect(
      (
        await first.formalizacionExpediente.findFirstOrThrow({
          where: { usuarioId: subject.id },
        })
      ).adscripcionId,
    ).toBe(academicId);
    await expect(
      first.adscripcionAcademica.delete({ where: { id: academicId } }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("coalesces a queue SLO alert across independent worker replicas", async () => {
    await first.outboxEvent.create({
      data: {
        type: "SYNTHETIC_SLO",
        aggregateId: suffix,
        payload: {},
        occurredAt: new Date(Date.now() - 3600000),
      },
    });
    const where = {
      source: "queue:outbox",
      code: "QUEUE_BACKLOG_SLO_EXCEEDED",
      state: { not: "RESOLVED" as const },
    };
    const before = await first.operationalAlert.count({ where });
    const settings = new ConfigService({
      OPERATIONS_QUEUE_SLO_JSON: '{"outbox":300}',
    });
    const counts = await Promise.all([
      new QueueMonitorWorker(first, settings, audit).monitor(),
      new QueueMonitorWorker(
        second,
        settings,
        new AuditService(second),
      ).monitor(),
    ]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(before ? 0 : 1);
    expect(await first.operationalAlert.count({ where })).toBe(before || 1);
  });
});
