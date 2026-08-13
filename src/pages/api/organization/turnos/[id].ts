import type { APIRoute } from "astro";

import {
  deleteTurno,
  getTurno,
  putTurno,
} from "../../../../server/api/organization/turno.api";

export const prerender = false;

export const GET = (({ locals, params }) =>
  getTurno(locals, params.id)) satisfies APIRoute;

export const PUT = (({ locals, params, request }) =>
  putTurno(locals, params.id, request)) satisfies APIRoute;

export const DELETE = (({ locals, params }) =>
  deleteTurno(locals, params.id)) satisfies APIRoute;
