import { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import session from "express-session";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiExceptionFilter } from "../src/common/errors/api-exception.filter";
import { conflict } from "../src/common/errors/domain-error";
import { NoStoreInterceptor } from "../src/common/http/no-store.interceptor";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { PermissionsGuard } from "../src/auth/permissions.guard";
import { SessionAuthGuard } from "../src/auth/session-auth.guard";
import { UserRepository } from "../src/auth/user.repository";
import { EstadoUsuario, RolUsuario } from "../src/generated/prisma/enums";
import { AreaController } from "../src/organization/area.controller";
import { SedeController } from "../src/organization/sede.controller";
import { AreaService } from "../src/organization/services/area.service";
import { SedeService } from "../src/organization/services/sede.service";
import { TurnoService } from "../src/organization/services/turno.service";
import { TurnoController } from "../src/organization/turno.controller";

const admin = createUser(1, "admin@ares.local", RolUsuario.ADMIN);
const regular = createUser(2, "user@ares.local", RolUsuario.PRESTADOR);
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
  authenticate: vi.fn(async (email: string) =>
    email === regular.email ? regular : admin,
  ),
};
const users = {
  findByIdForSession: vi.fn(async (id: number) =>
    id === regular.id ? regular : admin,
  ),
};
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

describe("Nest API", () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        AuthController,
        SedeController,
        AreaController,
        TurnoController,
      ],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: UserRepository, useValue: users },
        { provide: SedeService, useValue: sedes },
        { provide: AreaService, useValue: areas },
        { provide: TurnoService, useValue: turnos },
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
      .get("/api/organization/sedes")
      .expect(403)
      .expect({ error: "FORBIDDEN" });
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
