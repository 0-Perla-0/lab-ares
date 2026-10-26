# Sistema visual de interfaz

ID: `interfaz` · Estado: parcial · Revisión: 2026-10-26

## Objetivo y alcance

Unificar la interfaz con un lenguaje visual claro de acento naranja, derivado de [referencia de diseño](cap-design.txt) (estilo "Cap").
Cambia presentación y tokens, no permisos, rutas, contratos API ni lógica de negocio. Cada pantalla migra como recorrido vertical.
Excluye marca institucional, contenido y políticas: no inventar identidad visual aprobada por la institución.

## Reglas y criterios de aceptación

- **AC-1:** Los componentes consumen tokens semánticos (`--color-*`, `--radius-*`, `--shadow-*`); no hay hex incrustado en primitivos. Los `--ares-*` quedan como alias hasta migrar todas las pantallas.
- **AC-2:** Acento único naranja. Relleno de acción `#c2410c` con texto `#fcfcfc` (≈5:1, AA); `#f97316` sólo como acento no textual (iconos, indicador activo, barras). Texto naranja sobre claro usa `#c2410c`.
- **AC-3:** Silueta: botones, tags y controles segmentados en píldora; tarjetas 12 px, tarjetas grandes y modales 16 px, inputs 6 px. Tarjetas del flujo con borde 1 px y sin sombra; sombra sólo en elementos flotantes.
- **AC-4:** Superficies `#fcfcfc` (no blanco puro) con bordes `#e0e0e0`; texto `#202020`, apoyo `#646464` (≥4.5:1). Modo oscuro con valores propios, no invertidos, y contraste verificado por separado.
- **AC-5:** Se conservan foco visible ≥3:1, objetivos ≥44 px, `prefers-reduced-motion`, `forced-colors`, portal/scroll/tamaños de modales y semántica ARIA existentes. Estado nunca sólo por color.
- **AC-6:** Sin horizontal scroll desde 320 px; los cambios no alteran textos accesibles ni roles usados por las pruebas de navegador.

## Diseño y evidencia

- Decisión (26/10): el naranja funcional se adapta de la referencia `cap-design.txt`, que lo trata como decorativo; el relleno se oscurece a `#c2410c` por contraste. El azul tinta/índigo se retira de botones y navegación; el texto pasa a `#202020`.
- Fuente: pila del sistema (`Inter`, `Segoe UI`, `system-ui`); no se descarga ninguna fuente externa en build. Cargar una fuente alojada requiere decisión aparte.
- [Tokens](../../../frontend/app/globals.css), [primitivos](../../../frontend/components/ui/primitives.tsx), [shell del portal](../../../frontend/components/portal/portal-shell.tsx).
- 26/10: tras enlazar páginas institucionales en la barra pública, axe y desborde se repitieron en Chromium (320/768/1280 px, claro y oscuro) sin fallos; los enlaces extra sólo aparecen desde 1024 px y el resto vive en el footer.
- Entrega y accesibilidad manual: [entrega](../entrega/spec.md) AC-3. Regresiones de modales: [modal-layout](../../../frontend/e2e/modal-layout.spec.ts).
- Fases: U0 tokens/modo oscuro; U1 primitivos; U2 shell y navegación; U3 sitio público y acceso; U4 portal por feature; U5 verificación visual y manual.

## Tareas y pendientes

- [x] **T1 · código · AC-1/2/3/4:** U0 tokens, alias `--ares-*` y modo oscuro (preferencia del sistema; `data-theme` lo fuerza) en [globals.css](../../../frontend/app/globals.css).
- [x] **T2 · código · AC-1/3/5:** U1 primitivos sobre tokens, píldoras y foco; gates: `tsc`, lint a11y y 69 unitarias aprobados; e2e no ejecutado.
- [x] **T3 · código · AC-3/5:** U2 shell claro del portal ([portal-shell](../../../frontend/components/portal/portal-shell.tsx)) y barra pública flotante en píldora; gates: tsc, lint a11y, unitarias, e2e Chromium de navegación, modales y contenido público.
- [x] **T4 · código · AC-3/6:** U3 (inicio, acceso, recuperación, invitación) y U4 (portal y consolas por feature) migrados a tokens sin hex; codemod por clases, revisión visual sólo de dashboard, usuarios e inicio con APIs interceptadas.
- [ ] **T5 · validación · AC-4/5/6:** Axe WCAG 2.2 AA y sin desborde a 320/768/1280 px en claro y oscuro ([theme-a11y](../../../frontend/e2e/theme-a11y.spec.ts), Chromium, APIs interceptadas); falta revisión manual (teclado, foco, zoom 200 %, lector) y otros navegadores.
- [ ] **T6 · externo · AC-1:** Aprobar identidad visual y fuente institucional si existe una guía oficial.
