import Link from "next/link";

import { Brand } from "./brand";
import { secondaryLinks } from "./public-links";

export function PublicFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-canvas)] text-[var(--color-ink)]">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 border-b border-[var(--color-border)] pb-10 md:flex-row md:justify-between">
          <div>
            <Brand />
            <p className="mt-5 max-w-sm text-sm leading-7 text-[var(--color-muted)]">
              El espacio operativo del Laboratorio de Inventores para organizar
              equipos, sedes y horarios con claridad.
            </p>
          </div>
          <div>
            <h2 className="text-xs font-medium uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-accent-text)]">
              Institucional
            </h2>
            <div className="mt-5 grid gap-3 text-sm text-[var(--color-muted)]">
              {secondaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="focus-ring w-fit rounded-md hover:text-[var(--color-ink)]"
                >
                  {link.label}
                </Link>
              ))}
            </div>
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
