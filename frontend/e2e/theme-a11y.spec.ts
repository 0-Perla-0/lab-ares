import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { installBackend2Api } from "./fixtures/backend2-api";

const routes = [
  "/",
  "/login",
  "/recuperar-contrasena",
  "/recuperar",
  "/invitacion?token=sintetico",
  "/portal",
  "/portal/usuarios",
  "/portal/asistencia",
  "/portal/turnos",
  "/portal/calendario",
  "/portal/biblioteca",
  "/portal/reportes",
  "/portal/inventario",
  "/portal/retencion",
];
const widths = [320, 768, 1280];
const schemes = ["light", "dark"] as const;
const shots = process.env.ARES_THEME_SHOTS;

for (const scheme of schemes) {
  for (const width of widths) {
    for (const route of routes) {
      test(`axe ${scheme} ${width}px ${route}`, async ({ page }) => {
        await page.emulateMedia({
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        await installBackend2Api(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await page.waitForTimeout(800);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .exclude("nextjs-portal")
          .analyze();
        expect(
          results.violations.map((violation) => ({
            id: violation.id,
            nodes: violation.nodes.slice(0, 3).map((node) => node.target),
          })),
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);

        if (shots) {
          const name = `${scheme}-${width}${route.replace(/[^a-z0-9]+/gi, "_")}`;
          await page.screenshot({ path: `${shots}/${name}.png` });
        }
      });
    }
  }
}
