/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { AuthUser } from "./server/auth/types";

declare global {
  namespace App {
    interface Locals {
      user: AuthUser | null;
    }

    interface SessionData {
      userId: number;
    }
  }
}

export {};
