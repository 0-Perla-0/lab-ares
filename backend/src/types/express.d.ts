import type { AuthUser } from "../auth/auth-user";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    authenticatedAt?: number;
    authenticationFactor?: "password" | "mfa";
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
