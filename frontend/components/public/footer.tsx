import Link from "next/link";

import { Brand } from "./brand";

const exploreLinkClassName =
  "focus-ring w-fit rounded-md hover:text-[var(--color-ink)]";
const headingClassName =
  "text-xs font-medium uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-accent-text)]";

export function PublicFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-canvas)] text-[var(--color-ink)]">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 border-b border-[var(--color-border)] pb-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Brand />
            <p className="mt-5 max-w-sm text-sm leading-7 text-[var(--color-muted)]">
              El espacio operativo del Laboratorio de Inventores para organizar
              equipos, sedes y horarios con claridad.
            </p>
          </div>
          <div>
            <h2 className={headingClassName}>Explorar</h2>
            <div className="mt-5 grid gap-3 text-sm text-[var(--color-muted)]">
              <Link href="/#plataforma" className={exploreLinkClassName}>
                Plataforma
              </Link>
              <Link href="/#como-funciona" className={exploreLinkClassName}>
                Cómo funciona
              </Link>
              <Link href="/#nosotros" className={exploreLinkClassName}>
                Nosotros
              </Link>
            </div>
          </div>
          <div>
            <h2 className={headingClassName}>Acceso</h2>
            <p className="mt-5 text-sm leading-7 text-[var(--color-muted)]">
              ¿Ya formas parte del equipo?
            </p>
            <Link
              href="/login"
              className="focus-ring mt-3 inline-flex rounded-md text-sm font-bold text-[var(--color-ink)] hover:text-[var(--color-accent-text)]"
            >
              Inicia sesión →
            </Link>
          </div>
        </div>
        <p className="pt-7 text-xs text-[var(--color-muted)]">
          © {new Date().getFullYear()} Laboratorio de Inventores. Todos los
          derechos reservados.
        </p>
      </div>
    </footer>
  );
}
