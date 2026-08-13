import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DiaSemana,
  EstadoUsuario,
  RolUsuario,
} from "../../../generated/prisma/enums";
import type { AuthUser } from "../../auth/types";
import { conflict, invalidInput, notFound } from "../../errors/domain-error";
import {
  actualizarTurno,
  crearTurno,
  desactivarTurno,
  listarTurnos,
  obtenerTurno,
} from "../../services/organization/turno.service";

import {
  deleteTurno,
  getTurno,
  getTurnos,
  postTurno,
  putTurno,
} from "./turno.api";

vi.mock("../../services/organization/turno.service", () => ({
  listarTurnos: vi.fn(),
  obtenerTurno: vi.fn(),
  crearTurno: vi.fn(),
  actualizarTurno: vi.fn(),
  desactivarTurno: vi.fn(),
}));

const mockedListarTurnos = vi.mocked(listarTurnos);
const mockedObtenerTurno = vi.mocked(obtenerTurno);
const mockedCrearTurno = vi.mocked(crearTurno);
const mockedActualizarTurno = vi.mocked(actualizarTurno);
const mockedDesactivarTurno = vi.mocked(desactivarTurno);

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
  return new Request("http://localhost/api/organization/turnos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valido = {
  nombre: "Matutino",
  areaId: 5,
  horaInicio: "08:00",
  horaFin: "12:30",
  dias: ["LUNES", "MIERCOLES"],
};

const turno = {
  id: 7,
  nombre: "Matutino",
  horaInicio: "08:00",
  horaFin: "12:30",
  activo: true,
  areaId: 5,
  dias: [DiaSemana.LUNES, DiaSemana.MIERCOLES],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("autorización", () => {
  it("rechaza a un anónimo con 401 en cada endpoint", async () => {
    const responses = await Promise.all([
      getTurnos(anonimo),
      getTurno(anonimo, "7"),
      postTurno(anonimo, jsonRequest(valido)),
      putTurno(anonimo, "7", jsonRequest(valido)),
      deleteTurno(anonimo, "7"),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "UNAUTHORIZED" });
    }
  });

  it("rechaza con 403 a un usuario autenticado sin permiso", async () => {
    const responses = await Promise.all([
      getTurnos(prestador),
      getTurno(prestador, "7"),
      postTurno(prestador, jsonRequest(valido)),
      putTurno(prestador, "7", jsonRequest(valido)),
      deleteTurno(prestador, "7"),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
    }

    expect(mockedListarTurnos).not.toHaveBeenCalled();
    expect(mockedCrearTurno).not.toHaveBeenCalled();
  });
});

describe("postTurno", () => {
  it("devuelve 201 y normaliza las horas a minutos", async () => {
    mockedCrearTurno.mockResolvedValue(turno);

    const response = await postTurno(admin, jsonRequest(valido));

    expect(response.status).toBe(201);
    expect(mockedCrearTurno).toHaveBeenCalledWith({
      nombre: "Matutino",
      areaId: 5,
      horaInicio: 480,
      horaFin: 750,
      dias: ["LUNES", "MIERCOLES"],
    });
  });

  it("devuelve el turno con horas HH:MM y días planos", async () => {
    mockedCrearTurno.mockResolvedValue(turno);

    const response = await postTurno(admin, jsonRequest(valido));
    const body = await response.json();

    expect(body.data.horaInicio).toBe("08:00");
    expect(body.data.dias).toEqual(["LUNES", "MIERCOLES"]);
  });

  it.each(["8:00", "24:00", "08:60", "0800", "08:00:00", ""])(
    "rechaza la hora %s con 400",
    async (horaInicio) => {
      const response = await postTurno(
        admin,
        jsonRequest({ ...valido, horaInicio }),
      );

      expect(response.status).toBe(400);
      expect(mockedCrearTurno).not.toHaveBeenCalled();
    },
  );

  it("rechaza horaInicio igual o posterior a horaFin", async () => {
    const response = await postTurno(
      admin,
      jsonRequest({ ...valido, horaInicio: "12:30", horaFin: "12:30" }),
    );

    expect(response.status).toBe(400);
    expect(mockedCrearTurno).not.toHaveBeenCalled();
  });

  it("exige al menos un día", async () => {
    const response = await postTurno(
      admin,
      jsonRequest({ ...valido, dias: [] }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.details.properties.dias.errors.length).toBeGreaterThan(0);
  });

  it("rechaza días repetidos", async () => {
    const response = await postTurno(
      admin,
      jsonRequest({ ...valido, dias: ["LUNES", "LUNES"] }),
    );

    expect(response.status).toBe(400);
    expect(mockedCrearTurno).not.toHaveBeenCalled();
  });

  it("rechaza un día que no existe en el enum", async () => {
    const response = await postTurno(
      admin,
      jsonRequest({ ...valido, dias: ["LUNEZ"] }),
    );

    expect(response.status).toBe(400);
    expect(mockedCrearTurno).not.toHaveBeenCalled();
  });

  it("traduce AREA_NOT_FOUND a 404 y AREA_INACTIVE a 409", async () => {
    mockedCrearTurno.mockRejectedValueOnce(notFound("AREA_NOT_FOUND"));
    expect((await postTurno(admin, jsonRequest(valido))).status).toBe(404);

    mockedCrearTurno.mockRejectedValueOnce(conflict("AREA_INACTIVE"));
    expect((await postTurno(admin, jsonRequest(valido))).status).toBe(409);
  });

  it("traduce TURNO_ALREADY_EXISTS a 409", async () => {
    mockedCrearTurno.mockRejectedValue(conflict("TURNO_ALREADY_EXISTS"));

    const response = await postTurno(admin, jsonRequest(valido));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "TURNO_ALREADY_EXISTS",
    });
  });
});

describe("putTurno", () => {
  it("acepta un cambio parcial de días", async () => {
    mockedActualizarTurno.mockResolvedValue(turno);

    const response = await putTurno(
      admin,
      "7",
      jsonRequest({ dias: ["SABADO"] }),
    );

    expect(response.status).toBe(200);
    expect(mockedActualizarTurno).toHaveBeenCalledWith(7, { dias: ["SABADO"] });
  });

  it("traduce el horario incoherente del Service a 400", async () => {
    mockedActualizarTurno.mockRejectedValue(
      invalidInput("TURNO_HORARIO_INVALIDO"),
    );

    const response = await putTurno(
      admin,
      "7",
      jsonRequest({ horaFin: "07:00" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "TURNO_HORARIO_INVALIDO",
    });
  });

  it("rechaza un body vacío", async () => {
    const response = await putTurno(admin, "7", jsonRequest({}));

    expect(response.status).toBe(400);
    expect(mockedActualizarTurno).not.toHaveBeenCalled();
  });
});

describe("getTurno y deleteTurno", () => {
  it("devuelve 200 con el turno", async () => {
    mockedObtenerTurno.mockResolvedValue(turno);

    const response = await getTurno(admin, "7");

    expect(response.status).toBe(200);
    expect(mockedObtenerTurno).toHaveBeenCalledWith(7);
  });

  it("traduce TURNO_NOT_FOUND a 404", async () => {
    mockedObtenerTurno.mockRejectedValue(notFound("TURNO_NOT_FOUND"));

    expect((await getTurno(admin, "999")).status).toBe(404);
  });

  it("desactiva y devuelve 200", async () => {
    mockedDesactivarTurno.mockResolvedValue({ ...turno, activo: false });

    const response = await deleteTurno(admin, "7");

    expect(response.status).toBe(200);
    expect(mockedDesactivarTurno).toHaveBeenCalledWith(7);
  });

  it.each(["abc", "0", undefined])(
    "devuelve 400 con el id %s",
    async (idParam) => {
      expect((await getTurno(admin, idParam)).status).toBe(400);
    },
  );
});
