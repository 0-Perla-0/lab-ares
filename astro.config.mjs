// @ts-check
import { defineConfig, envField } from "astro/config";

import node from "@astrojs/node";

import react from "@astrojs/react";

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

  // Authentication will configure a persistent session strategy explicitly.
  // Until then, do not enable the Node adapter's filesystem-backed default.
  session: false,
});
