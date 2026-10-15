import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { AuditService } from "../../src/auth/audit.service";
import { FeaturePoliciesService } from "../../src/common/domain/feature-policies.service";
import { DocumentsService } from "../../src/documents/documents.service";
import { ServicePeriodsService } from "../../src/documents/service-periods.service";
import { KairosService } from "../../src/kairos/kairos.service";
import { ReportsService } from "../../src/reports/reports.service";
import { OperationIntentsController } from "../../src/operations/operation-intents.controller";
import { DomainTransaction } from "../../src/common/domain/domain-transaction";
import { withWorkerWriteBarrier } from "../../src/common/domain/worker-write-barrier";
import { AcademicService } from "../../src/academic/academic.service";

const url = process.env.DATABASE_URL;
if (!url || !/_(test|ci)$/.test(new URL(url).pathname))
  throw new Error("Remaining closure requires an isolated _test/_ci database");
const config = new ConfigService({ DATABASE_URL: url });
const db = new PrismaService(config),
  replica = new PrismaService(config);
const audit = new AuditService(db),
  features = new FeaturePoliciesService(db, config);
const periods = new ServicePeriodsService(db, audit, features);
const periodsReplica = new ServicePeriodsService(
  replica,
  new AuditService(replica),
  new FeaturePoliciesService(replica, config),
);
const suffix = randomUUID().slice(0, 8),
  key = () => `remaining-${randomUUID()}`;
let admin: any, subject: any, coordinator: any, formalization: any;
describe("remaining closure durable boundaries on MariaDB", () => {
  beforeAll(async () => {
    const sede = await db.sede.create({
      data: { nombre: `remaining-${suffix}` },
    });
    const area = await db.area.create({
      data: { nombre: "Remaining", sedeId: sede.id },
    });
    const create = (
      label: string,
      rol: "ADMIN" | "PRESTADOR" | "COORDINADOR",
    ) =>
      db.usuario.create({
        data: {
          codigo: `remaining-${label}-${suffix}`,
          email: `remaining-${label}-${suffix}@example.test`,
          passwordHash: "non-login-fixture",
          estado: "ACTIVA",
          rol,
          sedeId: sede.id,
          areaId: area.id,
        },
      });
    admin = await create("admin", "ADMIN");
    subject = await create("subject", "PRESTADOR");
    coordinator = await create("coordinator", "COORDINADOR");
    const institution = await db.institucionAcademica.create({
      data: { nombre: `remaining-${suffix}` },
    });
    const unit = await db.unidadAcademica.create({
      data: { nombre: "Unit", institucionId: institution.id },
    });
    const program = await db.programaAcademico.create({
      data: { nombre: "Program", unidadAcademicaId: unit.id },
    });
    await db.adscripcionAcademica.create({
      data: {
        usuarioId: subject.id,
        institucionId: institution.id,
        programaAcademicoId: program.id,
        inicio: new Date("2026-01-01"),
        vigente: true,
        estado: "CONFIRMADA",
      },
    });
    formalization = await new DocumentsService(
      db,
      {} as any,
      audit,
      features,
    ).formalize(admin, key(), { usuarioId: subject.id, inicio: "2026-10-12" });
  });
  afterAll(async () => {
    await db.$disconnect();
    await replica.$disconnect();
  });
  it("creates exactly one period/event/notice across independent replicas", async () => {
    const intent = key(),
      input = {
        formalizacionId: formalization.id,
        fin: "2027-01-31",
        motivo: "Synthetic administrative registration",
      };
    const [one, two] = await Promise.all([
      periods.create(admin, intent, input),
      periodsReplica.create(admin, intent, input),
    ]);
    expect(one).toEqual(two);
    expect(
      await db.periodoServicio.count({
        where: { formalizacionId: formalization.id },
      }),
    ).toBe(1);
    expect(
      await db.eventoPeriodoServicio.count({ where: { periodoId: one.id } }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { userId: subject.id, type: "SERVICE_PERIOD_CHANGED" },
      }),
    ).toBe(1);
  });
  it("serializes conflicting transitions, permits administrative closure and never creates hours", async () => {
    const period = await db.periodoServicio.findUniqueOrThrow({
      where: { formalizacionId: formalization.id },
    });
    const started = await periods.transition(admin, key(), period.id, {
      expectedVersion: 1,
      estado: "INICIADO",
      motivo: "Synthetic operational initiation",
    });
    const results = await Promise.allSettled([
      periods.transition(admin, key(), period.id, {
        expectedVersion: 2,
        estado: "CERRADO",
        motivo: "Synthetic administrative closure",
      }),
      periodsReplica.transition(coordinator, key(), period.id, {
        expectedVersion: 2,
        estado: "CANCELADO",
        motivo: "Synthetic administrative cancellation",
      }),
    ]);
    expect(started.estado).toBe("INICIADO");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.eventoPeriodoServicio.count({ where: { periodoId: period.id } }),
    ).toBe(3);
    expect(await db.asistencia.count({ where: { userId: subject.id } })).toBe(
      0,
    );
  });
  it("rolls back the event, receipt and period when central audit fails", async () => {
    const another = await new DocumentsService(db, {} as any, audit).formalize(
      admin,
      key(),
      { usuarioId: subject.id, inicio: "2026-10-13" },
    );
    const failing = new ServicePeriodsService(
      db,
      {
        append: async () => {
          throw new Error("forced audit failure");
        },
      } as any,
      features,
    );
    const intent = key();
    await expect(
      failing.create(admin, intent, {
        formalizacionId: another.id,
        fin: "2027-01-31",
        motivo: "Synthetic rollback registration",
      }),
    ).rejects.toThrow("forced audit failure");
    expect(
      await db.periodoServicio.count({
        where: { formalizacionId: another.id },
      }),
    ).toBe(0);
    expect(
      await db.domainOperation.count({
        where: { actorId: admin.id, key: intent },
      }),
    ).toBe(0);
  });
  it("deduplicates project creation and denies receipts after membership removal", async () => {
    const first = new KairosService(db, audit, features),
      second = new KairosService(
        replica,
        new AuditService(replica),
        new FeaturePoliciesService(replica, config),
      );
    const intent = key(),
      input = { nombre: `remaining-project-${suffix}` };
    const [one, two] = await Promise.all([
      first.create(coordinator, input, intent),
      second.create(coordinator, input, intent),
    ]);
    expect(one).toEqual(two);
    expect(
      await db.proyectoKairos.count({ where: { nombre: input.nombre } }),
    ).toBe(1);
    // Do not orphan a real owner: this is a synthetic membership revocation fixture.
    await db.miembroProyectoKairos.update({
      where: {
        proyectoId_usuarioId: { proyectoId: one.id, usuarioId: coordinator.id },
      },
      data: { removedAt: new Date() },
    });
    await expect(
      first.create(coordinator, input, intent),
    ).rejects.toMatchObject({ code: "KAIROS_PROJECT_NOT_FOUND" });
  });
  it("accepts canonical replay with reordered properties but rejects changed content", async () => {
    const intent = key(),
      tx = new DomainTransaction(db);
    let effects = 0;
    const apply = async () => {
      effects++;
      return { privateResult: "synthetic" };
    };
    await tx.run(
      admin,
      intent,
      { action: "SYNTHETIC", nested: { b: 2, a: 1 } },
      apply,
    );
    await tx.run(
      admin,
      intent,
      { nested: { a: 1, b: 2 }, action: "SYNTHETIC" },
      apply,
    );
    expect(effects).toBe(1);
    await expect(
      tx.run(
        admin,
        intent,
        { action: "SYNTHETIC", nested: { a: 1, b: 3 } },
        apply,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });
  it("audits a durable academic catalog once and treats duplicates as a definitive conflict", async () => {
    const academic = new AcademicService(db),
      intent = key(),
      nombre = `remaining-catalog-${suffix}`;
    const first = await academic.createCatalog(
      "institucion",
      { nombre },
      { actor: admin, key: intent },
    );
    expect(
      await academic.createCatalog(
        "institucion",
        { nombre },
        { actor: admin, key: intent },
      ),
    ).toEqual(first);
    expect(
      await db.auditEvent.count({
        where: {
          actorId: admin.id,
          action: "ACADEMIC_CATALOG_CREATED",
          objectId: `institucion:${first.id}`,
        },
      }),
    ).toBe(1);
    await expect(
      academic.createCatalog(
        "institucion",
        { nombre },
        { actor: admin, key: key() },
      ),
    ).rejects.toMatchObject({ code: "ACADEMIC_CATALOG_ALREADY_EXISTS" });
  });
  it("consults only the caller's commit metadata without revealing stored responses", async () => {
    const intent = key();
    await new DomainTransaction(db).run(
      admin,
      intent,
      { action: "SYNTHETIC_LOOKUP" },
      async () => ({ sensitive: "must-not-leave-lookup" }),
    );
    const controller = new OperationIntentsController(db);
    const result = await controller.status({ user: admin } as any, intent);
    expect(result.data.state).toBe("COMMITTED");
    expect(JSON.stringify(result)).not.toContain("must-not-leave-lookup");
    expect(
      (await controller.status({ user: subject } as any, intent)).data.state,
    ).toBe("UNCONFIRMED");
  });
  it("denies report downloads after a transfer, including if the request actor was stale", async () => {
    const fileId = randomUUID().replaceAll("-", "").slice(0, 30);
    await db.archivo.create({
      data: {
        id: fileId,
        propietarioId: coordinator.id,
        originalName: "synthetic.csv",
        detectedMime: "text/csv",
        sizeBytes: 3,
        objectKey: `synthetic/${fileId}`,
        quarantineKey: `synthetic/q/${fileId}`,
        status: "DISPONIBLE",
      },
    });
    const job = await db.reporteExportacion.create({
      data: {
        requesterId: coordinator.id,
        type: "DOCUMENTS",
        status: "COMPLETADO",
        archivoId: fileId,
        expiresAt: new Date(Date.now() + 60000),
        filters: {
          from: "2026-10-01",
          to: "2026-10-14",
          scope: "area",
          sedeId: coordinator.sedeId,
          areaId: coordinator.areaId,
        },
      },
    });
    let signed = 0;
    const reports = new ReportsService(db, audit, {
      downloadUrl: async () => {
        signed++;
        return "private";
      },
    } as any);
    await db.usuario.update({
      where: { id: coordinator.id },
      data: { areaId: null },
    });
    try {
      await expect(reports.download(coordinator, job.id)).rejects.toMatchObject(
        { status: 403 },
      );
      expect(signed).toBe(0);
    } finally {
      await db.usuario.update({
        where: { id: coordinator.id },
        data: { areaId: coordinator.areaId },
      });
    }
  });
  it("uses captured documentary placement after the subject transfers or becomes inactive", async () => {
    const fileId = randomUUID().replaceAll("-", "").slice(0, 30);
    await db.archivo.create({
      data: {
        id: fileId,
        propietarioId: subject.id,
        originalName: "synthetic.pdf",
        detectedMime: "application/pdf",
        sizeBytes: 10,
        objectKey: `synthetic/${fileId}`,
        quarantineKey: `synthetic/q/${fileId}`,
        status: "DISPONIBLE",
      },
    });
    const requirement = await db.requisitoDocumento.create({
      data: {
        usuarioId: subject.id,
        codigo: key(),
        nombre: "Synthetic requirement",
      },
    });
    const version = await new DocumentsService(
      db,
      {} as any,
      audit,
      features,
    ).upload(
      subject,
      { requisitoId: requirement.id, archivoId: fileId },
      key(),
    );
    await db.usuario.update({
      where: { id: subject.id },
      data: { areaId: null, estado: "SUSPENDIDA" },
    });
    try {
      const reports = new ReportsService(db, audit, {} as any);
      const exported = await reports.requestExport(coordinator, {
        type: "DOCUMENTS",
        from: "2026-10-01",
        to: "2026-11-01",
      });
      expect(exported.sync).toBe(true);
      if (exported.sync) expect(exported.body.toString()).toContain(version.id);
    } finally {
      await db.usuario.update({
        where: { id: subject.id },
        data: { areaId: subject.areaId, estado: "ACTIVA" },
      });
    }
  });
  it("orders worker effects before freeze and rejects the old epoch after unfreeze", async () => {
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const effect = withWorkerWriteBarrier(db, async (_tx, version) => {
      entered();
      await proceed;
      return version;
    });
    await ready;
    const freeze = replica.recoveryWriteBarrier.update({
      where: { id: "global" },
      data: { active: true, version: { increment: 1 } },
    });
    release();
    const previousVersion = await effect;
    await freeze;
    try {
      await expect(
        withWorkerWriteBarrier(db, async () => "forbidden"),
      ).rejects.toMatchObject({ code: "RECOVERY_WRITE_BARRIER_ACTIVE" });
    } finally {
      await replica.recoveryWriteBarrier.update({
        where: { id: "global" },
        data: { active: false, version: { increment: 1 } },
      });
    }
    await expect(
      withWorkerWriteBarrier(db, async () => "old-owner", previousVersion),
    ).rejects.toMatchObject({ code: "RECOVERY_WRITE_BARRIER_ACTIVE" });
  });
});
