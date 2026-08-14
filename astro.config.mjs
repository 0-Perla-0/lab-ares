// @ts-check
import { defineConfig, envField, sessionDrivers } from "astro/config";

import node from "@astrojs/node";

import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  output: "server",

  adapter: node({
    mode: "standalone",
  }),

  integrations: [react()],

  env: {
    schema: {
      DATABASE_URL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },

  session: {
    driver: sessionDrivers.fsLite({
      base: ".astro/sessions",
    }),
    cookie: {
      name: "ares-session",
      sameSite: "lax",
    },
    ttl: 60 * 60 * 8,
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
