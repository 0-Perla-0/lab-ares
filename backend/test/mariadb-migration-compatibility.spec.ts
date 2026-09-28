import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFileSync(
    resolve(process.cwd(), `prisma/migrations/${name}/migration.sql`),
    "utf8",
  );

describe("MariaDB migration compatibility", () => {
  it("uses the referenced utf8mb4 collation for every Kairos activity table", () => {
    const sql = migration("20260925220000_kairos_activities");

    for (const table of [
      "ActividadKairos",
      "ParticipanteActividadKairos",
      "EntregaEvidenciaKairos",
      "ComentarioActividadKairos",
      "HistorialActividadKairos",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          "CREATE TABLE `" +
            table +
            "`[\\s\\S]*?DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
        ),
      );
    }
  });

  it("does not cascade updates into columns protected by CHECK constraints", () => {
    const cases: Array<[string, string[]]> = [
      [
        "20260925250000_operational_library",
        [
          "DocumentoBiblioteca_sedeId_fkey",
          "DocumentoBiblioteca_areaId_fkey",
          "DocumentoBiblioteca_proyectoId_fkey",
        ],
      ],
      [
        "20260925270000_public_content_cms",
        ["BloqueContenidoPublico_activoPublicoId_fkey"],
      ],
      [
        "20260925280000_private_gamification",
        ["EventoGamificacion_reversaDeId_fkey"],
      ],
      [
        "20260925290000_printing_3d",
        [
          "TrabajoImpresion3D_operadorAsignadoId_fkey",
          "TrabajoImpresion3D_revisadoPorId_fkey",
          "TrabajoImpresion3D_canceladoPorId_fkey",
        ],
      ],
      [
        "20260925300000_retention_suppression",
        [
          "ReglaRetencion_aprobadoPorId_fkey",
          "RetencionLegal_liberadoPorId_fkey",
          "SolicitudSupresion_resueltoPorId_fkey",
          "LoteSupresion_autorizadoPorId_fkey",
        ],
      ],
    ];

    for (const [name, constraints] of cases) {
      const sql = migration(name);
      for (const constraint of constraints) {
        expect(sql).toMatch(
          new RegExp(
            "CONSTRAINT `" + constraint + "`[\\s\\S]*?ON UPDATE RESTRICT",
          ),
        );
      }
    }
  });
});
