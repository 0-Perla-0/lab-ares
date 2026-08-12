import type { APIRoute } from "astro";
import { getPrisma } from "../../server/db/prisma";

export const prerender = false;

const responseInit = {
  headers: {
    "Cache-Control": "no-store",
  },
};

export const GET = (async () => {
  try {
    await getPrisma().$queryRaw`SELECT 1`;

    return Response.json(
      {
        status: "ok",
        database: "connected",
      },
      responseInit,
    );
  } catch (error) {
    console.error("Database health check failed: ", error);

    return Response.json(
      {
        status: "error",
        database: "disconnected",
      },
      {
        status: 503,
        ...responseInit,
      },
    );
  }
}) satisfies APIRoute;
