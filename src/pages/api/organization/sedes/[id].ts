import type { APIRoute } from "astro";

import {
  deleteSede,
  getSede,
  putSede,
} from "../../../../server/api/organization/sede.api";

export const prerender = false;

export const GET = (({ locals, params }) =>
  getSede(locals, params.id)) satisfies APIRoute;

export const PUT = (({ locals, params, request }) =>
  putSede(locals, params.id, request)) satisfies APIRoute;

export const DELETE = (({ locals, params }) =>
  deleteSede(locals, params.id)) satisfies APIRoute;
