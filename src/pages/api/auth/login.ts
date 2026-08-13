import type { APIRoute } from "astro";

import { loginSchema } from "../../../schemas/auth";
import {
  authenticate,
  InvalidCredentialsError,
} from "../../../server/auth/auth.service";

export const prerender = false;

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

export const POST = (async ({ request, session }) => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error: "VALIDATION_ERROR",
        details: {},
      },
      {
        status: 400,
        headers: noStoreHeaders,
      },
    );
  }

  const result = loginSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "VALIDATION_ERROR",
        details: {},
      },
      {
        status: 400,
        headers: noStoreHeaders,
      },
    );
  }

  try {
    const user = await authenticate(result.data.email, result.data.password);

    if (!session) {
      return Response.json(
        { error: "INTERNAL_SERVER_ERROR" },
        {
          status: 500,
          headers: noStoreHeaders,
        },
      );
    }

    await session.regenerate();
    session.set("userId", user.id);

    return Response.json(
      { data: user },
      {
        status: 200,
        headers: noStoreHeaders,
      },
    );
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return Response.json(
        { error: "INVALID_CREDENTIALS" },
        {
          status: 401,
          headers: noStoreHeaders,
        },
      );
    }

    return Response.json(
      { error: "INTERNAL_SERVER_ERROR" },
      {
        status: 500,
        headers: noStoreHeaders,
      },
    );
  }
}) satisfies APIRoute;
