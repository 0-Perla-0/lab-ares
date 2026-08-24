import Link from "next/link";

import { Brand } from "./brand";

const links = [
  { href: "/#plataforma", label: "Plataforma" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#nosotros", label: "Nosotros" },
];

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#12221b]/10 bg-[#fcfbf7]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Brand />

        <nav
          className="hidden items-center gap-8 md:flex"
          aria-label="Principal"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="focus-ring rounded-md text-sm font-bold text-[#435249] transition hover:text-[#12221b]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/login"
          className="focus-ring rounded-full bg-[#12221b] px-5 py-2.5 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#243d32]"
        >
          Entrar al portal
        </Link>
      </div>
    </header>
  );
}
