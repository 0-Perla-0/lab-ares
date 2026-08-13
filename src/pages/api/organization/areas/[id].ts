import type { APIRoute } from "astro";

import {
  deleteArea,
  getArea,
  putArea,
} from "../../../../server/api/organization/area.api";

export const prerender = false;

export const GET = (({ locals, params }) =>
  getArea(locals, params.id)) satisfies APIRoute;

export const PUT = (({ locals, params, request }) =>
  putArea(locals, params.id, request)) satisfies APIRoute;

export const DELETE = (({ locals, params }) =>
  deleteArea(locals, params.id)) satisfies APIRoute;
