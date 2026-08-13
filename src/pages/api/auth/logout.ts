import type { APIRoute } from "astro";

export const prerender = false;

export const POST = (({ session }) => {
  session?.destroy();

  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}) satisfies APIRoute;
