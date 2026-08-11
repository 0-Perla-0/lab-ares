import type { APIRoute } from "astro";
import { prisma } from "../../server/db/prisma";

export const GET = (async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return Response.json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed: ", error);

    return Response.json(
      {
        status: "error",
        database: "disconnected",
      },
      {
        status: 503,
      },
    );
  }
}) satisfies APIRoute;
