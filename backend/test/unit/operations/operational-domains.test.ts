import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { Permission, getAccessScope } from "../../../src/auth/permissions";
import {
  organizationalScope,
  requireOrganization,
} from "../../../src/common/domain/scope";
import {
  itemCreateSchema,
  movementSchema,
  quantitySchema,
  returnSchema,
} from "../../../src/inventory/inventory.schemas";
import { visitEntrySchema } from "../../../src/visits/visits.schemas";
import { VisitsService } from "../../../src/visits/visits.service";
import { InventoryService } from "../../../src/inventory/inventory.service";
import { operationalPhasePaths } from "../../../src/openapi/operational-phases.openapi";
import { ApiException } from "../../../src/common/errors/api.exception";
const actor: any = { id: 1, rol: "COORDINADOR", areaId: 2, sedeId: 3 };
describe("operational domain contracts", () => {
  it("denies visitors/inventory permissions to prestadores", () => {
    for (const permission of [
      Permission.VISITS_REQUEST,
      Permission.VISITS_CONTROL,
      Permission.INVENTORY_MANAGE,
    ])
      expect(
        getAccessScope({ ...actor, rol: "PRESTADOR" }, permission),
      ).toBeNull();
  });
  it("constrains coordinators to both area and sede", () => {
    expect(organizationalScope(actor, Permission.INVENTORY_READ)).toEqual({
      areaId: 2,
      sedeId: 3,
    });
    expect(() =>
      requireOrganization(actor, Permission.VISITS_CONTROL, {
        areaId: 2,
        sedeId: 4,
      }),
    ).toThrow(ApiException);
    expect(() =>
      requireOrganization(actor, Permission.INVENTORY_MANAGE, {
        areaId: null,
        sedeId: 3,
      }),
    ).toThrow(ApiException);
  });
  it("does not authorize entry by QR alone", () => {
    expect(visitEntrySchema.safeParse({ version: 1 }).success).toBe(false);
    expect(
      visitEntrySchema.safeParse({
        version: 1,
        identificacionVerificada: false,
      }).success,
    ).toBe(false);
  });
  it.each([0.001, Number.NaN, Infinity, 100000000])(
    "rejects invalid exact quantities %s",
    (value) => expect(quantitySchema.safeParse(value).success).toBe(false),
  );
  it("supports signed adjustments but not signed exits or zero movements", () => {
    expect(
      movementSchema.safeParse({
        articuloId: "item",
        version: 1,
        tipo: "AJUSTE",
        cantidad: -2.12,
        motivo: "Reconteo físico",
      }).success,
    ).toBe(true);
    expect(
      movementSchema.safeParse({
        articuloId: "item",
        version: 1,
        tipo: "SALIDA",
        cantidad: -1,
        motivo: "Salida física",
      }).success,
    ).toBe(false);
  });
  it("requires units for consumables and individual identification for assets", () => {
    const base = {
      codigo: "CODE",
      nombre: "Test",
      ubicacionId: 1,
      reason: "Alta inicial",
    };
    expect(
      itemCreateSchema.safeParse({ ...base, tipo: "CONSUMIBLE" }).success,
    ).toBe(false);
    expect(
      itemCreateSchema.safeParse({
        ...base,
        tipo: "ACTIVO",
        unidadMedida: "kg",
      }).success,
    ).toBe(false);
  });
  it("return cannot mark asset still on loan", () =>
    expect(
      returnSchema.safeParse({
        estadoFisico: "EN_PRESTAMO",
        motivo: "Revisión física",
      }).success,
    ).toBe(false));
  it("flags fail closed without writing", () => {
    const writes: any = { run: vi.fn() };
    const config = new ConfigService({
      VISITS_ENABLED: false,
      INVENTORY_ENABLED: false,
    });
    const visits = new VisitsService({} as any, writes, {} as any, config);
    const inventory = new InventoryService(
      {} as any,
      writes,
      {} as any,
      config,
    );
    expect(() => visits.create(actor, "key", {} as any)).toThrow(ApiException);
    expect(() => inventory.movement(actor, "key", {} as any)).toThrow(
      ApiException,
    );
    expect(writes.run).not.toHaveBeenCalled();
  });
  it("documents private/staff routes with permissions, auth and idempotency", () => {
    const entry = operationalPhasePaths["/api/visits/{id}/check-in"].post;
    expect(entry["x-permission"]).toBe("visits:control");
    expect(entry.security).toEqual([{ cookieAuth: [] }]);
    expect(entry.parameters).toContainEqual(
      expect.objectContaining({ name: "Idempotency-Key", required: true }),
    );
    expect(JSON.stringify(entry)).toContain("identificacionVerificada");
  });
});
