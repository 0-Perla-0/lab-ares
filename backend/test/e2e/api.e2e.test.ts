import { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import session from "express-session";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuthController } from "../../src/auth/auth.controller";
import { AuthService } from "../../src/auth/auth.service";
import {
  LoginRateLimitGuard,
  LoginRateLimiter,
} from "../../src/auth/login-rate-limiter";
import { PermissionsGuard } from "../../src/auth/permissions.guard";
import { SessionAuthGuard } from "../../src/auth/session-auth.guard";
import { UserRepository } from "../../src/auth/user.repository";
import { AttendanceController } from "../../src/attendance/attendance.controller";
import { AttendanceService } from "../../src/attendance/attendance.service";
import { ApiExceptionFilter } from "../../src/common/errors/api-exception.filter";
import { conflict } from "../../src/common/errors/domain-error";
import { NoStoreInterceptor } from "../../src/common/http/no-store.interceptor";
import { EstadoUsuario, RolUsuario } from "../../src/generated/prisma/enums";
import { OpenApiController } from "../../src/openapi/openapi.controller";
import { AreaController } from "../../src/organization/area.controller";
import { OrganizationPolicy } from "../../src/organization/organization.policy";
import { AreaRepository } from "../../src/organization/repositories/area.repository";
import { TurnoRepository } from "../../src/organization/repositories/turno.repository";
import { SedeController } from "../../src/organization/sede.controller";
import { AreaService } from "../../src/organization/services/area.service";
import { SedeService } from "../../src/organization/services/sede.service";
import { TurnoService } from "../../src/organization/services/turno.service";
import { TurnoController } from "../../src/organization/turno.controller";
import { UsersController } from "../../src/users/users.controller";
import { UsersPolicy } from "../../src/users/users.policy";
import { UsersRepository } from "../../src/users/users.repository";
import { UsersService } from "../../src/users/users.service";

const admin = createUser(1, "admin@ares.local", RolUsuario.ADMIN);
const regular = createUser(2, "user@ares.local", RolUsuario.PRESTADOR);
const sedeManager = {
  ...createUser(3, "manager@ares.local", RolUsuario.JEFE_SEDE),
  sedeId: 1,
};
const sede = {
  id: 1,
  nombre: "Centro",
  direccion: null,
  activa: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
const area = {
  id: 2,
  nombre: "Desarrollo",
  activa: true,
  sedeId: 1,
  createdAt: sede.createdAt,
  updatedAt: sede.updatedAt,
};
const turno = {
  id: 3,
  nombre: "Matutino",
  horaInicio: "08:00",
  horaFin: "12:00",
  activo: true,
  areaId: 2,
  dias: ["LUNES"],
  createdAt: sede.createdAt,
  updatedAt: sede.updatedAt,
};

const auth = {
  authenticate: vi.fn(async (email: string) => {
    if (email === regular.email) return regular;
    if (email === sedeManager.email) return sedeManager;
    return admin;
  }),
};
const sessionUsers = {
  findByIdForSession: vi.fn(async (id: number) => {
    if (id === regular.id) return regular;
    if (id === sedeManager.id) return sedeManager;
    return admin;
  }),
};
const managedUser = {
  ...regular,
  id: 20,
  codigo: "POSTMAN20",
  email: "postman20@ares.local",
  sedeId: 1,
  areaId: 2,
  turnoId: 3,
  createdAt: sede.createdAt,
  updatedAt: sede.updatedAt,
};
const managedUsers = {
  listar: vi.fn(async () => [managedUser]),
  crear: vi.fn(async () => managedUser),
  obtener: vi.fn(async () => managedUser),
  actualizar: vi.fn(async () => managedUser),
  darDeBaja: vi.fn(async () => ({
    ...managedUser,
    estado: EstadoUsuario.BAJA,
  })),
};
const userRecords = { findById: vi.fn(async () => managedUser) };
const sedes = {
  listar: vi.fn(async () => [sede]),
  crear: vi.fn(async () => sede),
  obtener: vi.fn(async () => sede),
  actualizar: vi.fn(async () => sede),
  desactivar: vi.fn(async () => ({ ...sede, activa: false })),
};
const areas = {
  listar: vi.fn(async () => [area]),
  crear: vi.fn(async () => area),
  obtener: vi.fn(async () => area),
  actualizar: vi.fn(async () => area),
  desactivar: vi.fn(async () => ({ ...area, activa: false })),
};
const turnos = {
  listar: vi.fn(async () => [turno]),
  crear: vi.fn(async () => turno),
  obtener: vi.fn(async () => turno),
  actualizar: vi.fn(async () => turno),
  desactivar: vi.fn(async () => ({ ...turno, activo: false })),
};
const areaRecords = { findById: vi.fn(async () => area) };
const turnoRecords = { findById: vi.fn(async () => turno) };
const loginRateLimiter = { consume: vi.fn(() => null), reset: vi.fn() };
const attendanceRecord = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  usuarioId: regular.id,
  sedeId: null,
  areaId: null,
  turnoId: null,
  estado: "ABIERTA",
  entradaAt: new Date("2026-08-25T15:00:00.000Z"),
  salidaAt: null,
  duracionMinutos: null,
  nivelRiesgo: "AMARILLO",
  motivosRiesgo: ["TURNO_NO_VERIFICADO"],
  versionReglaRiesgo: "attendance-risk-2026-08-25-v1",
  estadoValidacion: "PENDIENTE",
  evidenciaEntrada: {
    ubicacionRegistrada: false,
    ipRegistrada: true,
  },
  evidenciaSalida: {
    ubicacionRegistrada: false,
    ipRegistrada: false,
  },
  createdAt: new Date("2026-08-25T15:00:00.000Z"),
  updatedAt: new Date("2026-08-25T15:00:00.000Z"),
};
const attendance = {
  checkIn: vi.fn(async () => attendanceRecord),
  checkOut: vi.fn(async () => ({
    ...attendanceRecord,
    estado: "CERRADA",
    salidaAt: new Date("2026-08-25T16:00:00.000Z"),
    duracionMinutos: 60,
    nivelRiesgo: "VERDE",
    motivosRiesgo: [],
  })),
  current: vi.fn(async () => attendanceRecord),
  ownHistory: vi.fn(async () => [attendanceRecord]),
};

describe("Nest API", () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        AuthController,
        AttendanceController,
        SedeController,
        AreaController,
        TurnoController,
        UsersController,
        OpenApiController,
      ],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: AttendanceService, useValue: attendance },
        { provide: LoginRateLimiter, useValue: loginRateLimiter },
        {
          provide: LoginRateLimitGuard,
          useValue: { canActivate: () => true },
        },
        { provide: UserRepository, useValue: sessionUsers },
        { provide: UsersService, useValue: managedUsers },
        { provide: UsersRepository, useValue: userRecords },
        UsersPolicy,
        { provide: SedeService, useValue: sedes },
        { provide: AreaService, useValue: areas },
        { provide: TurnoService, useValue: turnos },
        OrganizationPolicy,
        { provide: AreaRepository, useValue: areaRecords },
        { provide: TurnoRepository, useValue: turnoRecords },
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

  it("returns 401 before validating a protected request", async () => {
    const response = await request(server)
      .post("/api/organization/sedes")
      .send({ nombre: "" })
      .expect(401);
    expect(response.body).toEqual({ error: "UNAUTHORIZED" });
  });

  it("publishes the OpenAPI contract without authentication", async () => {
    const response = await request(server)
      .get("/api/docs/openapi.json")
      .expect(200);
    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.paths).toHaveProperty("/api/auth/login");
  });

  it("validates and normalizes login input", async () => {
    await request(server)
      .post("/api/auth/login")
      .send({ email: "bad", password: "" })
      .expect(400)
      .expect(({ body }) => expect(body.error).toBe("VALIDATION_ERROR"));

    const response = await request(server)
      .post("/api/auth/login")
      .send({ email: "  ADMIN@ARES.LOCAL ", password: "secret" })
      .expect(200);
    expect(response.body.data).not.toHaveProperty("passwordHash");
    expect(auth.authenticate).toHaveBeenLastCalledWith(
      "admin@ares.local",
      "secret",
    );
  });

  it("persists the session and exposes the current user", async () => {
    const agent = await loginAs(admin.email);
    const response = await agent.get("/api/auth/me").expect(200);
    expect(response.body).toEqual({ data: admin });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("enforces permissions after authentication", async () => {
    const agent = await loginAs(regular.email);
    await agent
      .post("/api/organization/sedes")
      .send({ nombre: "Centro" })
      .expect(403)
      .expect({ error: "FORBIDDEN" });
  });

  it("exposes the idempotent self-attendance vertical slice", async () => {
    const agent = await loginAs(regular.email);

    await agent
      .post("/api/attendance/check-in")
      .send({})
      .expect(400)
      .expect(({ body }) => expect(body.error).toBe("VALIDATION_ERROR"));

    await agent
      .post("/api/attendance/check-in")
      .set("Idempotency-Key", "550e8400-e29b-41d4-a716-446655440001")
      .send({})
      .expect(200)
      .expect(({ body }) => expect(body.data.estado).toBe("ABIERTA"));
    expect(attendance.checkIn).toHaveBeenLastCalledWith(
      regular,
      "550e8400-e29b-41d4-a716-446655440001",
      {},
      expect.objectContaining({ ip: expect.any(String) }),
    );

    await agent
      .get("/api/attendance/me/current")
      .expect(200)
      .expect(({ body }) => expect(body.data.id).toBe(attendanceRecord.id));
    await agent
      .get("/api/attendance/me")
      .expect(200)
      .expect(({ body }) => expect(body.data).toHaveLength(1));

    await agent
      .post("/api/attendance/check-out")
      .set("Idempotency-Key", "550e8400-e29b-41d4-a716-446655440002")
      .send({})
      .expect(200)
      .expect(({ body }) => expect(body.data.estado).toBe("CERRADA"));
  });

  it("enforces sede scope after role authorization", async () => {
    const agent = await loginAs(sedeManager.email);
    await agent
      .post("/api/organization/sedes")
      .send({ nombre: "Nueva sede" })
      .expect(403);
    await agent
      .put("/api/organization/sedes/1")
      .send({ direccion: "Propia" })
      .expect(200);
    await agent
      .put("/api/organization/sedes/2")
      .send({ direccion: "Ajena" })
      .expect(403);
  });

  it("returns the preserved data envelope for authorized requests", async () => {
    const agent = await loginAs(admin.email);
    await agent
      .get("/api/organization/sedes")
      .expect(200)
      .expect({ data: [JSON.parse(JSON.stringify(sede))] });
    await agent
      .post("/api/organization/sedes")
      .send({ nombre: " Centro ", direccion: "" })
      .expect(201)
      .expect(({ body }) => expect(body.data.nombre).toBe("Centro"));
    expect(sedes.crear).toHaveBeenLastCalledWith({
      nombre: "Centro",
      direccion: null,
    });
  });

  it("maps validation and domain errors to the existing API contract", async () => {
    const agent = await loginAs(admin.email);
    await agent
      .put("/api/organization/sedes/1")
      .send({})
      .expect(400)
      .expect(({ body }) => expect(body.error).toBe("VALIDATION_ERROR"));
    await agent
      .get("/api/organization/sedes/not-a-number")
      .expect(400)
      .expect(({ body }) => expect(body.error).toBe("VALIDATION_ERROR"));

    sedes.obtener.mockRejectedValueOnce(conflict("SEDE_ALREADY_EXISTS"));
    await agent
      .get("/api/organization/sedes/1")
      .expect(409)
      .expect({ error: "SEDE_ALREADY_EXISTS" });
  });

  it("exposes the migrated area routes", async () => {
    const agent = await loginAs(admin.email);
    await agent
      .get("/api/organization/areas")
      .expect(200)
      .expect({ data: [JSON.parse(JSON.stringify(area))] });
    await agent
      .post("/api/organization/areas")
      .send({ nombre: " Desarrollo ", sedeId: 1 })
      .expect(201);
    expect(areas.crear).toHaveBeenLastCalledWith({
      nombre: "Desarrollo",
      sedeId: 1,
    });
    await agent.delete("/api/organization/areas/2").expect(200);
  });

  it("exposes the migrated turno routes and transforms time input", async () => {
    const agent = await loginAs(admin.email);
    await agent
      .get("/api/organization/turnos")
      .expect(200)
      .expect({ data: [JSON.parse(JSON.stringify(turno))] });
    await agent
      .post("/api/organization/turnos")
      .send({
        nombre: " Matutino ",
        areaId: 2,
        horaInicio: "08:00",
        horaFin: "12:00",
        dias: ["LUNES"],
      })
      .expect(201);
    expect(turnos.crear).toHaveBeenLastCalledWith({
      nombre: "Matutino",
      areaId: 2,
      horaInicio: 480,
      horaFin: 720,
      dias: ["LUNES"],
    });
    await agent.delete("/api/organization/turnos/3").expect(200);
  });

  it("exposes the scoped user CRUD without password data", async () => {
    const agent = await loginAs(admin.email);

    await agent
      .get("/api/users")
      .expect(200)
      .expect({ data: [JSON.parse(JSON.stringify(managedUser))] });
    expect(managedUsers.listar).toHaveBeenLastCalledWith({ type: "global" });

    await agent
      .post("/api/users")
      .send({
        codigo: " POSTMAN20 ",
        email: " POSTMAN20@ARES.LOCAL ",
        password: "A-secure-password-123!",
        estado: EstadoUsuario.ACTIVO,
        sedeId: 1,
        areaId: 2,
        turnoId: 3,
      })
      .expect(201);
    expect(managedUsers.crear).toHaveBeenLastCalledWith({
      codigo: "POSTMAN20",
      email: "postman20@ares.local",
      password: "A-secure-password-123!",
      rol: RolUsuario.PRESTADOR,
      estado: EstadoUsuario.ACTIVO,
      sedeId: 1,
      areaId: 2,
      turnoId: 3,
    });

    await agent.get("/api/users/20").expect(200);
    await agent
      .put("/api/users/20")
      .send({ email: " UPDATED@ARES.LOCAL " })
      .expect(200);
    expect(managedUsers.actualizar).toHaveBeenLastCalledWith(20, {
      email: "updated@ares.local",
    });

    const deleted = await agent.delete("/api/users/20").expect(200);
    expect(deleted.body.data.estado).toBe(EstadoUsuario.BAJA);
    expect(deleted.body.data).not.toHaveProperty("passwordHash");
  });

  it("destroys the session on logout", async () => {
    const agent = await loginAs(admin.email);
    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);
  });

  async function loginAs(email: string) {
    const agent = request.agent(server);
    await agent
      .post("/api/auth/login")
      .send({ email, password: "secret" })
      .expect(200);
    return agent;
  }
});

function createUser(id: number, email: string, rol: RolUsuario) {
  return {
    id,
    codigo: `USER${id}`,
    email,
    rol,
    estado: EstadoUsuario.ACTIVO,
    sedeId: null,
    areaId: null,
    turnoId: null,
  };
}
