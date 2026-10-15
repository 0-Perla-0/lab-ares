import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../common/errors/api.exception";
import { operationalNotification } from "../common/domain/operational-notification";
import { Prisma } from "../generated/prisma/client";
import { AuditService } from "./audit.service";

@Injectable()
export class AuthThrottleService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}
  private key(kind: string, value: string) {
    return createHmac(
      "sha256",
      this.config.getOrThrow<string>("SESSION_SECRET"),
    )
      .update(`${kind}:${value.trim().toLowerCase()}`)
      .digest("hex");
  }
  private async transaction<T>(
    apply: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(apply, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        });
      } catch (error) {
        if (
          attempt < 2 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2002", "P2034"].includes(error.code)
        )
          continue;
        throw error;
      }
    }
  }
  async consumeNetwork(path: string, address: string, now = new Date()) {
    const key = this.key("network", `${path}:${address}`);
    const count = await this.transaction(async (tx) => {
      await tx.authThrottle.upsert({
        where: { key },
        create: { key, resetAt: new Date(now.getTime() + 60000) },
        update: {},
      });
      await tx.$queryRaw`SELECT \`key\` FROM AuthThrottle WHERE \`key\` = ${key} FOR UPDATE`;
      const row = await tx.authThrottle.findUniqueOrThrow({ where: { key } });
      const expired = row.resetAt <= now;
      const next = expired ? 1 : row.count + 1;
      await tx.authThrottle.update({
        where: { key },
        data: {
          count: next,
          ...(expired ? { resetAt: new Date(now.getTime() + 60000) } : {}),
        },
      });
      return {
        next,
        until: expired ? new Date(now.getTime() + 60000) : row.resetAt,
      };
    });
    if (count.next > 30)
      throw new ApiException("TOO_MANY_REQUESTS", 429, {
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((count.until.getTime() - now.getTime()) / 1000),
        ),
      });
  }
  async assertAccount(email: string, now = new Date()) {
    const row = await this.db.authThrottle.findUnique({
      where: { key: this.key("account", email) },
    });
    if (row?.blockedUntil && row.blockedUntil > now)
      throw new ApiException("TOO_MANY_REQUESTS", 429, {
        retryAfterSeconds: Math.ceil(
          (row.blockedUntil.getTime() - now.getTime()) / 1000,
        ),
      });
  }
  async failure(email: string, now = new Date()) {
    const key = this.key("account", email);
    await this.transaction(async (tx) => {
      await tx.authThrottle.upsert({
        where: { key },
        create: { key, resetAt: new Date(now.getTime() + 900000) },
        update: {},
      });
      await tx.$queryRaw`SELECT \`key\` FROM AuthThrottle WHERE \`key\` = ${key} FOR UPDATE`;
      const row = await tx.authThrottle.findUniqueOrThrow({ where: { key } });
      const next = row.resetAt <= now ? 1 : row.count + 1;
      // Progressive cool-down is shared across replicas and independent of IP.
      const delay =
        next >= 10
          ? 900000
          : next < 3
            ? 0
            : Math.min(30000, 1000 * 2 ** (next - 3));
      await tx.authThrottle.update({
        where: { key },
        data: {
          count: next,
          resetAt: new Date(now.getTime() + 900000),
          blockedUntil: delay ? new Date(now.getTime() + delay) : null,
        },
      });
      if (next === 10) {
        const user = await tx.usuario.findUnique({
          where: { email: email.trim().toLowerCase() },
          select: { id: true },
        });
        if (user)
          await operationalNotification(
            tx,
            user.id,
            "IDENTITY_TEMPORARILY_THROTTLED",
            { temporarilyBlocked: true },
          );
        await new AuditService(this.db).append(
          {
            subjectId: user?.id,
            action: "IDENTITY_TEMPORARILY_THROTTLED",
            resource: "identity",
            module: "IDENTITY",
            metadata: { temporaryMinutes: 15 },
          },
          tx,
        );
        await tx.operationalAlert.create({
          data: {
            severity: "S3",
            source: "auth",
            code: "IDENTITY_TEMPORARILY_THROTTLED",
            message:
              "Ten consecutive authentication failures triggered a temporary account throttle.",
          },
        });
      }
    });
  }
  async success(email: string) {
    await this.db.authThrottle.deleteMany({
      where: { key: this.key("account", email) },
    });
  }
}
