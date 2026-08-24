"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  Clock3,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  UsersRound,
  X,
} from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Brand } from "@/components/public/brand";
import { apiRequest } from "@/lib/api";
import { initials } from "@/lib/format";
import { canReadUsers, roleLabels } from "@/lib/permissions";

const navigation = [
  { href: "/portal", label: "Resumen", icon: LayoutDashboard, exact: true },
  { href: "/portal/sedes", label: "Sedes", icon: Building2 },
  { href: "/portal/areas", label: "Áreas", icon: MapPinned },
  { href: "/portal/turnos", label: "Turnos", icon: Clock3 },
  {
    href: "/portal/usuarios",
    label: "Usuarios",
    icon: UsersRound,
    users: true,
  },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const links = navigation.filter((item) => !item.users || canReadUsers(user));

  const sidebar = (
    <>
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
        <Brand inverse />
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          className="focus-ring rounded-xl p-2 text-white/60 hover:bg-white/10 lg:hidden"
          aria-label="Cerrar menú"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 py-5">
        <p className="px-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/30">
          Espacio de trabajo
        </p>
        <nav className="mt-3 space-y-1" aria-label="Portal">
          {links.map(({ href, label, icon: Icon, exact }) => {
            const active = exact
              ? pathname === href
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`focus-ring flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-extrabold transition ${
                  active
                    ? "bg-[#c8f169] text-[#12221b]"
                    : "text-white/60 hover:bg-white/7 hover:text-white"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4834f] text-xs font-black text-[#12221b]">
              {initials(user.codigo || user.email)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">
                {user.codigo}
              </p>
              <p className="truncate text-[11px] font-semibold text-white/40">
                {roleLabels[user.rol]}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={loggingOut}
            className="focus-ring mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-extrabold text-white/55 hover:bg-white/7 hover:text-white disabled:opacity-50"
          >
            <LogOut size={15} /> {loggingOut ? "Saliendo…" : "Cerrar sesión"}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="portal-background min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col bg-[#12221b] lg:flex">
        {sidebar}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative flex h-full w-[min(86vw,19rem)] flex-col bg-[#12221b] shadow-2xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-17 items-center justify-between border-b border-[#12221b]/10 bg-[#f7f7f3]/90 px-4 backdrop-blur-xl sm:px-7 lg:justify-end">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="focus-ring rounded-xl border border-[#12221b]/10 bg-white p-2.5 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-black">{user.codigo}</p>
              <p className="text-[10px] font-semibold text-[#7a8580]">
                {user.email}
              </p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#c8f169] text-[11px] font-black">
              {initials(user.codigo || user.email)}
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[92rem] px-4 py-7 sm:px-7 sm:py-9 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
