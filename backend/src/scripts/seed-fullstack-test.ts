import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database/prisma.service";
import { hashPassword } from "../auth/password";
import { recordOperationalHistory } from "../common/domain/operational-history";
import { dateColumn, mexicoInstant, nextDay } from "../calendar/calendar-time";
import { localParts } from "../attendance/attendance-risk";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !/_(test|ci)$/.test(new URL(url).pathname))
    throw new Error("Seed requires an isolated _test or _ci database");
  const db = new PrismaService(new ConfigService({ DATABASE_URL: url }));
  try {
    // Refuse reseeding an existing acceptance identity. A new project/database
    // is required instead of deleting unknown data or resetting shared accounts.
    if (
      await db.usuario.findFirst({
        where: { email: { endsWith: "@fullstack.example.test" } },
      })
    )
      throw new Error(
        "Acceptance fixture already exists; use a fresh database",
      );
    const passwordHash = await hashPassword("Acceptance-Test-Only!2026");
    const ids = await db.$transaction(
      async (tx) => {
        const suffix = randomUUID().slice(0, 8);
        const sede = await tx.sede.create({
          data: { nombre: `Acceptance-${suffix}` },
        });
        const area = await tx.area.create({
          data: { nombre: "Acceptance", sedeId: sede.id },
        });
        const turno = await tx.turno.create({
          data: {
            nombre: "Acceptance",
            areaId: area.id,
            horaInicio: new Date("1970-01-01T00:00:00Z"),
            horaFin: new Date("1970-01-01T23:58:00Z"),
            dias: {
              create: [
                "LUNES",
                "MARTES",
                "MIERCOLES",
                "JUEVES",
                "VIERNES",
                "SABADO",
                "DOMINGO",
              ].map((dia) => ({ dia: dia as never })),
            },
          },
        });
        await recordOperationalHistory(tx, "SEDE", sede.id);
        await recordOperationalHistory(tx, "AREA", area.id);
        await recordOperationalHistory(tx, "SHIFT", turno.id);
        const users: Record<string, number> = {};
        for (const engine of ["", "-chromium", "-firefox", "-webkit"]) {
          for (const [label, rol] of [
            ["prestador", "PRESTADOR"],
            ["expedient", "PRESTADOR"],
            ["security", "PRESTADOR"],
            ["reauth", "PRESTADOR"],
            ["expiry", "PRESTADOR"],
            ["coordinador", "COORDINADOR"],
            ["jefatura", "JEFE_AREA"],
            ["admin", "ADMIN"],
          ] as const) {
            const user = await tx.usuario.create({
              data: {
                codigo: `accept-${label}${engine}-${suffix}`,
                email: `${label}${engine}@fullstack.example.test`,
                passwordHash,
                rol,
                estado: "ACTIVA",
                sedeId: sede.id,
                areaId: area.id,
                turnoId: turno.id,
              },
            });
            await recordOperationalHistory(tx, "USER", user.id);
            users[`${label}${engine}`] = user.id;
          }
        }
        const today = localParts(new Date()).day;
        const absence = await tx.ausencia.create({
          data: {
            userId: users.prestador,
            sedeId: sede.id,
            areaId: area.id,
            turnoId: turno.id,
            fecha: dateColumn(nextDay(today, -1)),
            plazoLimiteAt: mexicoInstant(nextDay(today, 7)),
          },
        });
        for (const engine of ["chromium", "firefox", "webkit"]) {
          await tx.ausencia.create({
            data: {
              userId: users[`prestador-${engine}`],
              sedeId: sede.id,
              areaId: area.id,
              turnoId: turno.id,
              fecha: dateColumn(nextDay(today, -1)),
              plazoLimiteAt: mexicoInstant(nextDay(today, 7)),
            },
          });
        }
        return {
          sedeId: sede.id,
          areaId: area.id,
          turnoId: turno.id,
          absenceId: absence.id,
          ...users,
        };
      },
      { timeout: 30000 },
    );
    console.log(JSON.stringify(ids));
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    "Acceptance seed refused/failed. Use a fresh isolated _test or _ci database.",
  );
  process.exitCode = 1;
});
