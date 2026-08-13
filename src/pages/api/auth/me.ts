import type { APIRoute } from "astro";

export const prerender = false;

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

export const GET = (({ locals }) => {
  if (!locals.user) {
    return Response.json(
      { error: "UNAUTHORIZED" },
      {
        status: 401,
        headers: noStoreHeaders,
      },
    );
  }

  return Response.json(
    { data: locals.user },
    {
      status: 200,
      headers: noStoreHeaders,
    },
  );
}) satisfies APIRoute;
