import { defineMiddleware } from "astro:middleware";

import { EstadoUsuario } from "./generated/prisma/enums";
import { findByIdForSession } from "./server/repositories/user.repository";

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = null;

  const session = context.session;

  if (!session) {
    return next();
  }

  const userId = await session.get("userId");

  if (userId === undefined) {
    return next();
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    session.destroy();
    return next();
  }

  const user = await findByIdForSession(userId);

  if (!user || user.estado !== EstadoUsuario.ACTIVO) {
    session.destroy();
    return next();
  }

  context.locals.user = user;

  return next();
});
