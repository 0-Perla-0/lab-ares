// @ts-check
import { defineConfig } from "astro/config";

import node from "@astrojs/node";

import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  adapter: node({
    mode: "standalone",
  }),

  integrations: [react()],

  vite:{
  plugins: [tailwindcss()],
  },

});
