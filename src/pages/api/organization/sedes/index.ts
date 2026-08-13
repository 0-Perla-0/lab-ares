import type { APIRoute } from "astro";

import {
  getSedes,
  postSede,
} from "../../../../server/api/organization/sede.api";

export const prerender = false;

export const GET = (({ locals }) => getSedes(locals)) satisfies APIRoute;

export const POST = (({ locals, request }) =>
  postSede(locals, request)) satisfies APIRoute;
