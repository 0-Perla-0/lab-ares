import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { InvitationsService } from "../../../src/invitations/invitations.service";
import { PrismaService } from "../../../src/database/prisma.service";
import { OutboxService } from "../../../src/auth/outbox.service";
import { AuditService } from "../../../src/auth/audit.service";
import { UsersPolicy } from "../../../src/users/users.policy";

describe("identity DI smoke", () => {
  it("resolves invitation service without opening a database connection", async () => {
    const module = await Test.createTestingModule({ providers: [InvitationsService, { provide: PrismaService, useValue: {} }, { provide: OutboxService, useValue: {} }, { provide: UsersPolicy, useValue: {} }, { provide: AuditService, useValue: {} }] }).compile();
    expect(module.get(InvitationsService)).toBeInstanceOf(InvitationsService);
    await module.close();
  });
});
