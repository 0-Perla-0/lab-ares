import { beforeEach, describe, expect, it, vi } from "vitest";

import { EstadoUsuario, RolUsuario } from "../../../generated/prisma/enums";
import type { AuthUser } from "../../auth/types";
import { conflict, notFound } from "../../errors/domain-error";
import {
  actualizarSede,
  crearSede,
  desactivarSede,
  listarSedes,
  obtenerSede,
} from "../../services/organization/sede.service";

import { deleteSede, getSede, getSedes, postSede, putSede } from "./sede.api";

vi.mock("../../services/organization/sede.service", () => ({
  listarSedes: vi.fn(),
  obtenerSede: vi.fn(),
  crearSede: vi.fn(),
  actualizarSede: vi.fn(),
  desactivarSede: vi.fn(),
}));

const mockedListarSedes = vi.mocked(listarSedes);
const mockedObtenerSede = vi.mocked(obtenerSede);
const mockedCrearSede = vi.mocked(crearSede);
const mockedActualizarSede = vi.mocked(actualizarSede);
const mockedDesactivarSede = vi.mocked(desactivarSede);

function usuario(rol: RolUsuario): AuthUser {
  return {
    id: 1,
    codigo: "TEST001",
    email: "test@ares.local",
    rol,
    estado: EstadoUsuario.ACTIVO,
    sedeId: null,
    areaId: null,
    turnoId: null,
  };
}

const anonimo: App.Locals = { user: null };
const admin: App.Locals = { user: usuario(RolUsuario.ADMIN) };
const prestador: App.Locals = { user: usuario(RolUsuario.PRESTADOR) };

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/organization/sedes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sede = {
  id: 1,
  nombre: "CUCEI Centro",
  direccion: null,
  activa: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("autorización", () => {
  it("rechaza a un anónimo con 401 en cada endpoint", async () => {
    const responses = await Promise.all([
      getSedes(anonimo),
      getSede(anonimo, "1"),
      postSede(anonimo, jsonRequest({ nombre: "X" })),
      putSede(anonimo, "1", jsonRequest({ nombre: "X" })),
      deleteSede(anonimo, "1"),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "UNAUTHORIZED" });
    }
  });

  it("rechaza con 403 a un usuario autenticado sin permiso", async () => {
    const responses = await Promise.all([
      getSedes(prestador),
      getSede(prestador, "1"),
      postSede(prestador, jsonRequest({ nombre: "X" })),
      putSede(prestador, "1", jsonRequest({ nombre: "X" })),
      deleteSede(prestador, "1"),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "FORBIDDEN" });
    }
  });

  it("no llega al Service cuando el guard corta", async () => {
    await getSedes(anonimo);
    await postSede(prestador, jsonRequest({ nombre: "X" }));

    expect(mockedListarSedes).not.toHaveBeenCalled();
    expect(mockedCrearSede).not.toHaveBeenCalled();
  });

  it("autoriza antes de validar: anónimo con body inválido recibe 401", async () => {
    const response = await postSede(anonimo, jsonRequest({ nombre: "" }));

    expect(response.status).toBe(401);
  });
});

describe("getSedes", () => {
  it("devuelve 200 con la lista envuelta en data", async () => {
    mockedListarSedes.mockResolvedValue([sede]);

    const response = await getSedes(admin);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          ...sede,
          createdAt: sede.createdAt.toISOString(),
          updatedAt: sede.updatedAt.toISOString(),
        },
      ],
    });
  });
});

describe("postSede", () => {
  it("devuelve 201 con la sede creada", async () => {
    mockedCrearSede.mockResolvedValue(sede);

    const response = await postSede(
      admin,
      jsonRequest({ nombre: "CUCEI Centro" }),
    );

    expect(response.status).toBe(201);
    expect(mockedCrearSede).toHaveBeenCalledWith({ nombre: "CUCEI Centro" });
  });

  it("devuelve 400 y el detalle de Zod cuando el nombre viene vacío", async () => {
    const response = await postSede(admin, jsonRequest({ nombre: "   " }));

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.details.properties.nombre.errors.length).toBeGreaterThan(0);
    expect(mockedCrearSede).not.toHaveBeenCalled();
  });

  it("devuelve 400 cuando el JSON está malformado", async () => {
    const request = new Request("http://localhost/api/organization/sedes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{roto",
    });

    const response = await postSede(admin, request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      details: { errors: ["Invalid JSON body"] },
    });
  });

  it("traduce el conflicto de dominio a 409", async () => {
    mockedCrearSede.mockRejectedValue(conflict("SEDE_ALREADY_EXISTS"));

    const response = await postSede(
      admin,
      jsonRequest({ nombre: "CUCEI Centro" }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "SEDE_ALREADY_EXISTS",
    });
  });

  it("no filtra el mensaje de un error inesperado", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedCrearSede.mockRejectedValue(
      new Error("Access denied for user 'ares'@'localhost'"),
    );

    const response = await postSede(
      admin,
      jsonRequest({ nombre: "CUCEI Centro" }),
    );

    expect(response.status).toBe(500);

    const body = await response.text();

    expect(body).toBe(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }));
    expect(body).not.toContain("Access denied");
  });
});

describe("getSede", () => {
  it("devuelve 200 con la sede", async () => {
    mockedObtenerSede.mockResolvedValue(sede);

    const response = await getSede(admin, "1");

    expect(response.status).toBe(200);
    expect(mockedObtenerSede).toHaveBeenCalledWith(1);
  });

  it("traduce NOT_FOUND a 404", async () => {
    mockedObtenerSede.mockRejectedValue(notFound("SEDE_NOT_FOUND"));

    const response = await getSede(admin, "999");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "SEDE_NOT_FOUND",
    });
  });

  it.each(["abc", "0", "-1", "1.5", undefined])(
    "devuelve 400 con el id %s",
    async (idParam) => {
      const response = await getSede(admin, idParam);

      expect(response.status).toBe(400);
      expect(mockedObtenerSede).not.toHaveBeenCalled();
    },
  );
});

describe("putSede", () => {
  it("actualiza solo los campos enviados", async () => {
    mockedActualizarSede.mockResolvedValue(sede);

    const response = await putSede(
      admin,
      "1",
      jsonRequest({ direccion: "Nueva dirección" }),
    );

    expect(response.status).toBe(200);
    expect(mockedActualizarSede).toHaveBeenCalledWith(1, {
      direccion: "Nueva dirección",
    });
  });

  it("rechaza un body vacío con 400", async () => {
    const response = await putSede(admin, "1", jsonRequest({}));

    expect(response.status).toBe(400);
    expect(mockedActualizarSede).not.toHaveBeenCalled();
  });
});

describe("deleteSede", () => {
  it("devuelve 200 con la sede desactivada", async () => {
    mockedDesactivarSede.mockResolvedValue({ ...sede, activa: false });

    const response = await deleteSede(admin, "1");

    expect(response.status).toBe(200);
    expect(mockedDesactivarSede).toHaveBeenCalledWith(1);
  });

  it("traduce NOT_FOUND a 404", async () => {
    mockedDesactivarSede.mockRejectedValue(notFound("SEDE_NOT_FOUND"));

    const response = await deleteSede(admin, "999");

    expect(response.status).toBe(404);
  });
});
