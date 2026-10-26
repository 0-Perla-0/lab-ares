import Link from "next/link";

import { Brand } from "./brand";

const links = [
  { href: "/#plataforma", label: "Plataforma" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#nosotros", label: "Nosotros" },
];

export function PublicHeader() {
  return (
    <header className="sticky top-3 z-30 px-3 sm:px-5">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 shadow-[var(--shadow-inset-highlight)] sm:px-6">
        <Brand />

        <nav
          className="hidden items-center gap-8 md:flex"
          aria-label="Principal"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="focus-ring rounded-md text-sm font-medium text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/login"
          className="focus-ring inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-[var(--color-primary)] px-4 sm:px-5 text-sm font-bold text-[var(--color-on-primary)] shadow-[var(--shadow-button)] transition hover:bg-[var(--color-primary-hover)]"
        >
          Entrar al portal
        </Link>
      </div>
    </header>
  );
}
