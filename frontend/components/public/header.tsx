import Link from "next/link";

import { Brand } from "./brand";
import { PublicMobileNav } from "./mobile-nav";
import { primaryLinks } from "./public-links";

export function PublicHeader() {
  return (
    <header className="sticky top-3 z-30 px-3 sm:px-5">
      <div className="relative mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 shadow-[var(--shadow-inset-highlight)] sm:gap-4 sm:px-6">
        <Brand />

        {/* Bajo 1280 px los enlaces no caben en una línea; viven en el menú desplegable. */}
        <nav
          className="hidden items-center gap-8 xl:flex"
          aria-label="Principal"
        >
          {primaryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="focus-ring whitespace-nowrap rounded-md text-sm font-medium text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/login"
            aria-label="Entrar al portal"
            className="focus-ring inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-[var(--color-primary)] px-4 sm:px-5 text-sm font-bold text-[var(--color-on-primary)] shadow-[var(--shadow-button)] transition hover:bg-[var(--color-primary-hover)]"
          >
            Entrar<span className="max-sm:hidden">&nbsp;al portal</span>
          </Link>
          <PublicMobileNav />
        </div>
      </div>
    </header>
  );
}
