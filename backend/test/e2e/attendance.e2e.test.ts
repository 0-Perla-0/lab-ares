import { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import session from "express-session";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AttendanceController } from "../../src/attendance/attendance.controller";
import { AttendanceService } from "../../src/attendance/attendance.service";
import { AuthController } from "../../src/auth/auth.controller";
import { AuthService } from "../../src/auth/auth.service";
import {
  LoginRateLimitGuard,
  LoginRateLimiter,
} from "../../src/auth/login-rate-limiter";
import { PermissionsGuard } from "../../src/auth/permissions.guard";
import { SessionAuthGuard } from "../../src/auth/session-auth.guard";
import { UserRepository } from "../../src/auth/user.repository";
import { ApiExceptionFilter } from "../../src/common/errors/api-exception.filter";
import { NoStoreInterceptor } from "../../src/common/http/no-store.interceptor";
import { EstadoUsuario, RolUsuario } from "../../src/generated/prisma/enums";

const admin = user(1, RolUsuario.ADMIN, "admin@ares.local");
const prestador = user(2, RolUsuario.PRESTADOR, "worker@ares.local");
const auth = {
  authenticate: vi.fn(async (email: string) =>
    email === prestador.email ? prestador : admin,
  ),
};
const users = {
  findByIdForSession: vi.fn(async (id: number) =>
    id === prestador.id ? prestador : admin,
  ),
};
const attendance = {
  mine: vi.fn(async () => ({ items: [], nextCursor: null })),
  open: vi.fn(async () => ({ items: [], nextCursor: null })),
  checkIn: vi.fn(async (actor, key) => ({ id: 1, actorId: actor.id, key })),
  checkOut: vi.fn(async (actor, key, id) => ({ id, actorId: actor.id, key })),
  close: vi.fn(async (actor, key, id, reason) => ({
    id,
    actorId: actor.id,
    key,
    reason,
  })),
};

describe("Attendance API", () => {
  let app: INestApplication;
  let server: Server;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AttendanceController, AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        {
          provide: LoginRateLimiter,
          useValue: { consume: vi.fn(() => null), reset: vi.fn() },
        },
        { provide: LoginRateLimitGuard, useValue: { canActivate: () => true } },
        { provide: UserRepository, useValue: users },
        { provide: AttendanceService, useValue: attendance },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
        { provide: APP_GUARD, useClass: SessionAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.use(
      session({
        secret: "test-session-secret-with-more-than-32-chars",
        resave: false,
        saveUninitialized: false,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });
  afterAll(async () => app.close());

  it("requires authentication and denies prestador management", async () => {
    await request(server).get("/api/attendance/me").expect(401);
    const agent = await login(prestador.email);
    await agent.get("/api/attendance/open").expect(403);
    await agent
      .post("/api/attendance/1/close")
      .set("Idempotency-Key", "a".repeat(16))
      .send({ reason: "manual" })
      .expect(403);
  });

  it("validates idempotency keys and check-in body", async () => {
    const agent = await login(prestador.email);
    await agent.post("/api/attendance/check-in").send({}).expect(400);
    await agent
      .post("/api/attendance/check-in")
      .set("Idempotency-Key", "short")
      .send({})
      .expect(400);
    await agent
      .post("/api/attendance/check-in")
      .set("Idempotency-Key", "a".repeat(16))
      .send({ userId: 9, checkInAt: "x" })
      .expect(400);
  });

  it("validates checkout and manual close inputs", async () => {
    const agent = await login(prestador.email);
    await agent
      .post("/api/attendance/check-out")
      .set("Idempotency-Key", "a".repeat(16))
      .send({})
      .expect(400);
    await agent
      .post("/api/attendance/1/close")
      .set("Idempotency-Key", "a".repeat(16))
      .send({ reason: "bad" })
      .expect(403);
  });

  it("returns envelopes, no-store, and session actor to the service", async () => {
    const agent = await login(prestador.email);
    const key = "b".repeat(16);
    const me = await agent.get("/api/attendance/me").expect(200);
    expect(me.body).toEqual({ data: { items: [], nextCursor: null } });
    expect(me.headers["cache-control"]).toBe("no-store");
    await agent
      .post("/api/attendance/check-in")
      .set("Idempotency-Key", key)
      .send({})
      .expect(200);
    expect(attendance.checkIn).toHaveBeenLastCalledWith(prestador, key);
    await agent
      .post("/api/attendance/check-out")
      .set("Idempotency-Key", key)
      .send({ attendanceId: 7 })
      .expect(200);
    expect(attendance.checkOut).toHaveBeenLastCalledWith(prestador, key, 7);
    const manager = await login(admin.email);
    await manager.get("/api/attendance/open").expect(200);
    await manager
      .post("/api/attendance/8/close")
      .set("Idempotency-Key", key)
      .send({ reason: "closed manually" })
      .expect(200);
    expect(attendance.close).toHaveBeenLastCalledWith(
      admin,
      key,
      8,
      "closed manually",
    );
  });

  async function login(email: string) {
    const agent = request.agent(server);
    await agent
      .post("/api/auth/login")
      .send({ email, password: "secret" })
      .expect(200);
    return agent;
  }
});

function user(id: number, rol: RolUsuario, email: string) {
  return {
    id,
    codigo: `USER${id}`,
    email,
    rol,
    estado: EstadoUsuario.ACTIVO,
    sedeId: 1,
    areaId: 2,
    turnoId: 3,
  };
}
