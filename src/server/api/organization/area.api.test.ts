import { beforeEach, describe, expect, it, vi } from "vitest";

import { EstadoUsuario, RolUsuario } from "../../../generated/prisma/enums";
import type { AuthUser } from "../../auth/types";
import { conflict, notFound } from "../../errors/domain-error";
import {
  actualizarArea,
  crearArea,
  desactivarArea,
  listarAreas,
  obtenerArea,
} from "../../services/organization/area.service";

import { deleteArea, getArea, getAreas, postArea, putArea } from "./area.api";

vi.mock("../../services/organization/area.service", () => ({
  listarAreas: vi.fn(),
  obtenerArea: vi.fn(),
  crearArea: vi.fn(),
  actualizarArea: vi.fn(),
  desactivarArea: vi.fn(),
}));

const mockedListarAreas = vi.mocked(listarAreas);
const mockedObtenerArea = vi.mocked(obtenerArea);
const mockedCrearArea = vi.mocked(crearArea);
const mockedActualizarArea = vi.mocked(actualizarArea);
const mockedDesactivarArea = vi.mocked(desactivarArea);

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
  return new Request("http://localhost/api/organization/areas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fecha = new Date("2026-01-01T00:00:00.000Z");

const area = {
  id: 10,
  nombre: "Desarrollo",
  activa: true,
  sedeId: 1,
  createdAt: fecha,
  updatedAt: fecha,
};

const areaValida = { nombre: "Desarrollo", sedeId: 1 };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("autorización", () => {
  it("rechaza a un anónimo con 401 en cada endpoint", async () => {
    const responses = await Promise.all([
      getAreas(anonimo),
      getArea(anonimo, "10"),
      postArea(anonimo, jsonRequest(areaValida)),
      putArea(anonimo, "10", jsonRequest(areaValida)),
      deleteArea(anonimo, "10"),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "UNAUTHORIZED" });
    }
  });

  it("rechaza con 403 a un usuario autenticado sin permiso", async () => {
    const responses = await Promise.all([
      getAreas(prestador),
      getArea(prestador, "10"),
      postArea(prestador, jsonRequest(areaValida)),
      putArea(prestador, "10", jsonRequest(areaValida)),
      deleteArea(prestador, "10"),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "FORBIDDEN" });
    }
  });

  it("no llega al Service cuando el guard corta", async () => {
    await getAreas(anonimo);
    await postArea(prestador, jsonRequest(areaValida));

    expect(mockedListarAreas).not.toHaveBeenCalled();
    expect(mockedCrearArea).not.toHaveBeenCalled();
  });
});

describe("postArea", () => {
  it("devuelve 201 con el área creada", async () => {
    mockedCrearArea.mockResolvedValue(area);

    const response = await postArea(admin, jsonRequest(areaValida));

    expect(response.status).toBe(201);
    expect(mockedCrearArea).toHaveBeenCalledWith(areaValida);
  });

  it("exige sedeId", async () => {
    const response = await postArea(admin, jsonRequest({ nombre: "X" }));

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.details.properties.sedeId.errors.length).toBeGreaterThan(0);
    expect(mockedCrearArea).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, "1"])("rechaza sedeId %s", async (sedeId) => {
    const response = await postArea(
      admin,
      jsonRequest({ nombre: "Desarrollo", sedeId }),
    );

    expect(response.status).toBe(400);
    expect(mockedCrearArea).not.toHaveBeenCalled();
  });

  it("traduce SEDE_NOT_FOUND a 404", async () => {
    mockedCrearArea.mockRejectedValue(notFound("SEDE_NOT_FOUND"));

    const response = await postArea(admin, jsonRequest(areaValida));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "SEDE_NOT_FOUND",
    });
  });

  it("traduce SEDE_INACTIVE a 409", async () => {
    mockedCrearArea.mockRejectedValue(conflict("SEDE_INACTIVE"));

    const response = await postArea(admin, jsonRequest(areaValida));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "SEDE_INACTIVE" });
  });

  it("traduce AREA_ALREADY_EXISTS a 409", async () => {
    mockedCrearArea.mockRejectedValue(conflict("AREA_ALREADY_EXISTS"));

    const response = await postArea(admin, jsonRequest(areaValida));

    expect(response.status).toBe(409);
  });
});

describe("getArea", () => {
  it("devuelve 200 con el área", async () => {
    mockedObtenerArea.mockResolvedValue(area);

    const response = await getArea(admin, "10");

    expect(response.status).toBe(200);
    expect(mockedObtenerArea).toHaveBeenCalledWith(10);
  });

  it("traduce AREA_NOT_FOUND a 404", async () => {
    mockedObtenerArea.mockRejectedValue(notFound("AREA_NOT_FOUND"));

    const response = await getArea(admin, "999");

    expect(response.status).toBe(404);
  });

  it.each(["abc", "0", "-1", undefined])(
    "devuelve 400 con el id %s",
    async (idParam) => {
      const response = await getArea(admin, idParam);

      expect(response.status).toBe(400);
      expect(mockedObtenerArea).not.toHaveBeenCalled();
    },
  );
});

describe("putArea", () => {
  it("actualiza solo los campos enviados", async () => {
    mockedActualizarArea.mockResolvedValue(area);

    const response = await putArea(admin, "10", jsonRequest({ sedeId: 2 }));

    expect(response.status).toBe(200);
    expect(mockedActualizarArea).toHaveBeenCalledWith(10, { sedeId: 2 });
  });

  it("rechaza un body vacío con 400", async () => {
    const response = await putArea(admin, "10", jsonRequest({}));

    expect(response.status).toBe(400);
    expect(mockedActualizarArea).not.toHaveBeenCalled();
  });
});

describe("deleteArea", () => {
  it("devuelve 200 con el área desactivada", async () => {
    mockedDesactivarArea.mockResolvedValue({ ...area, activa: false });

    const response = await deleteArea(admin, "10");

    expect(response.status).toBe(200);
    expect(mockedDesactivarArea).toHaveBeenCalledWith(10);
  });
});
