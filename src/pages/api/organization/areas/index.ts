import type { APIRoute } from "astro";

import {
  getAreas,
  postArea,
} from "../../../../server/api/organization/area.api";

export const prerender = false;

export const GET = (({ locals }) => getAreas(locals)) satisfies APIRoute;

export const POST = (({ locals, request }) =>
  postArea(locals, request)) satisfies APIRoute;
