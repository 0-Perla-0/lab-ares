import type { APIRoute } from "astro";

import {
  getTurnos,
  postTurno,
} from "../../../../server/api/organization/turno.api";

export const prerender = false;

export const GET = (({ locals }) => getTurnos(locals)) satisfies APIRoute;

export const POST = (({ locals, request }) =>
  postTurno(locals, request)) satisfies APIRoute;
