import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { AuthUser } from "../../auth/auth-user";
import { AuditService } from "../../auth/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { DomainTransaction } from "./domain-transaction";
import { pilotAllows } from "./operational-pilot";
import { ApiException } from "../errors/api.exception";
import type { Prisma } from "../../generated/prisma/client";

export const featureKeys = [
  "VISITS",
  "VISITS.REQUEST",
  "INVENTORY",
  "INVENTORY.MOVEMENT",
  "PRINTING_3D",
  "PRINTING_3D.REQUEST",
  "GAMIFICATION",
  "GAMIFICATION.AWARD",
  "ATTENDANCE.CONTINGENCY",
  "DOCUMENTS",
  "DOCUMENTS.UPLOAD",
  "DOCUMENTS.FORMALIZE",
  "DOCUMENTS.PERIOD",
  "KAIROS",
  "KAIROS.ACTIVITY",
  "KAIROS.PROJECT",
  "ABSENCES.GENERATE",
  "GAMIFICATION.KAIROS_AWARD",
] as const;
export type FeatureKey = (typeof featureKeys)[number];
export const featureKeySchema = z.enum(featureKeys);
const ids = z
  .array(z.number().int().positive())
  .max(500)
  .transform((values) => [...new Set(values)].sort((a, b) => a - b));
export const featurePolicySchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    enabled: z.boolean(),
    sedeIds: ids,
    areaIds: ids,
    userIds: ids,
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

@Injectable()
export class FeaturePoliciesService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}
  async list() {
    return this.db.featurePolicy.findMany({ orderBy: { module: "asc" } });
  }
  async capabilities(actor: AuthUser) {
    const rows = await this.list();
    return Object.fromEntries(
      featureKeys.map((key) => [key, this.allowed(key, actor, rows)]),
    );
  }
  private allowed(
    key: FeatureKey,
    actor: Pick<AuthUser, "id" | "sedeId" | "areaId">,
    policies: Awaited<ReturnType<FeaturePoliciesService["list"]>>,
  ) {
    const module = key.split(".")[0];
    const ceiling = ["ATTENDANCE", "DOCUMENTS", "KAIROS", "ABSENCES"].includes(
      module,
    )
      ? true
      : !!this.config.get(`${module}_ENABLED`);
    if (
      !ceiling ||
      (["VISITS", "INVENTORY", "ATTENDANCE"].includes(module) &&
        !pilotAllows(this.config, actor))
    )
      return false;
    return policies
      .filter((row) => row.module === module || row.module === key)
      .every((row) => {
        const list = (v: unknown) =>
          Array.isArray(v) && v.every((id) => Number.isInteger(id) && id > 0)
            ? (v as number[])
            : null;
        const sedes = list(row.sedeIds),
          areas = list(row.areaIds),
          users = list(row.userIds);
        return (
          row.enabled &&
          !!sedes &&
          !!areas &&
          !!users &&
          (!sedes.length || sedes.includes(actor.sedeId ?? -1)) &&
          (!areas.length || areas.includes(actor.areaId ?? -1)) &&
          (!users.length || users.includes(actor.id))
        );
      });
  }
  async require(key: FeatureKey, actor: AuthUser) {
    if (!this.allowed(key, actor, await this.list()))
      throw new ApiException("FEATURE_OUTSIDE_PILOT", 404);
  }
  async allowsInTransaction(
    tx: Prisma.TransactionClient,
    key: FeatureKey,
    actor: Pick<AuthUser, "id" | "sedeId" | "areaId">,
  ) {
    await tx.$queryRaw`SELECT module FROM FeaturePolicy WHERE module IN (${key.split(".")[0]}, ${key}) LOCK IN SHARE MODE`;
    return this.allowed(
      key,
      actor,
      await tx.featurePolicy.findMany({ orderBy: { module: "asc" } }),
    );
  }
  async requireInTransaction(
    tx: Prisma.TransactionClient,
    key: FeatureKey,
    actor: AuthUser,
  ) {
    if (!(await this.allowsInTransaction(tx, key, actor)))
      throw new ApiException("FEATURE_OUTSIDE_PILOT", 404);
  }
  async publish(
    actor: AuthUser,
    key: FeatureKey,
    idempotencyKey: string,
    input: z.infer<typeof featurePolicySchema>,
  ) {
    return new DomainTransaction(this.db).run(
      actor,
      idempotencyKey,
      { action: "FEATURE_POLICY", key, ...input },
      async (tx) => {
        const current = await tx.featurePolicy.findUnique({
          where: { module: key },
        });
        if ((current?.version ?? 0) !== input.expectedVersion)
          throw new ApiException("FEATURE_POLICY_VERSION_CHANGED", 409);
        const { expectedVersion: _, ...data } = input;
        if (current) {
          const claim = await tx.featurePolicy.updateMany({
            where: { module: key, version: input.expectedVersion },
            data: { ...data, version: { increment: 1 }, changedById: actor.id },
          });
          if (!claim.count)
            throw new ApiException("FEATURE_POLICY_VERSION_CHANGED", 409);
        } else {
          // Unique key + DomainTransaction retry covers concurrent first publication.
          await tx.featurePolicy.create({
            data: { module: key, version: 1, ...data, changedById: actor.id },
          });
        }
        const next = await tx.featurePolicy.findUniqueOrThrow({
          where: { module: key },
        });
        await new AuditService(this.db).append(
          {
            actorId: actor.id,
            actorRole: actor.rol,
            action: "FEATURE_POLICY_PUBLISHED",
            module: "OPERATIONS",
            resource: "feature_policy",
            objectId: key,
            metadata: {
              previous: current
                ? {
                    version: current.version,
                    enabled: current.enabled,
                    sedeIds: current.sedeIds,
                    areaIds: current.areaIds,
                    userIds: current.userIds,
                  }
                : null,
              next: { version: next.version, ...data },
            },
          },
          tx,
        );
        return next;
      },
    );
  }
}
