"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Building2,
  Clock3,
  ContactRound,
  FileText,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  MapPinned,
  Menu,
  Newspaper,
  Printer,
  ShieldCheck,
  Trophy,
  UsersRound,
  X,
} from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Brand } from "@/components/public/brand";
import { apiRequest } from "@/lib/api";
import {
  visibleBackend2Navigation,
  type Backend2NavigationItem,
} from "@/lib/backend2/navigation";
import { initials } from "@/lib/format";
import { canReadUsers, roleLabels } from "@/lib/permissions";

type NavigationIcon = ComponentType<{
  size?: number | string;
  strokeWidth?: number | string;
  "aria-hidden"?: boolean;
}>;

type NavigationItem = {
  href: string;
  label: string;
  icon: NavigationIcon;
  exact?: boolean;
};

const backend2Icons: Record<Backend2NavigationItem["icon"], NavigationIcon> = {
  academic: GraduationCap,
  documents: FileText,
  directory: ContactRound,
  kairos: FolderKanban,
  reports: BarChart3,
  library: Library,
  cms: Newspaper,
  gamification: Trophy,
  printing: Printer,
  retention: ShieldCheck,
};

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  async function logout() {
    setLoggingOut(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const backend2Groups = visibleBackend2Navigation(user).map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      href: item.href,
      label: item.label,
      icon: backend2Icons[item.icon] ?? BookOpen,
    })),
  }));
  const navigationGroups: { label: string; items: NavigationItem[] }[] = [
    {
      label: "Espacio de trabajo",
      items: [
        {
          href: "/portal",
          label: "Resumen",
          icon: LayoutDashboard,
          exact: true,
        },
        { href: "/portal/asistencia", label: "Asistencia", icon: Clock3 },
      ],
    },
    ...backend2Groups,
    {
      label: "Organización",
      items: [
        { href: "/portal/sedes", label: "Sedes", icon: Building2 },
        { href: "/portal/areas", label: "Áreas", icon: MapPinned },
        { href: "/portal/turnos", label: "Turnos", icon: Clock3 },
        ...(canReadUsers(user)
          ? [{ href: "/portal/usuarios", label: "Usuarios", icon: UsersRound }]
          : []),
      ],
    },
  ];

  function sidebar(mobile = false) {
    return (
      <>
        <div className="safe-area-top flex min-h-20 items-center justify-between border-b border-white/10 px-5">
          <Brand inverse />
          {mobile && (
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setMenuOpen(false)}
              className="focus-ring grid min-h-11 min-w-11 place-items-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar menú"
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="safe-area-bottom flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-5">
          <nav className="space-y-6" aria-label="Navegación del portal">
            {navigationGroups.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <p className="px-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/55">
                  {group.label}
                </p>
                <div className="mt-2 space-y-1">
                  {group.items.map(({ href, label, icon: Icon, exact }) => {
                    const active = exact
                      ? pathname === href
                      : pathname === href || pathname.startsWith(`${href}/`);
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMenuOpen(false)}
                        className={`focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-extrabold transition ${
                          active
                            ? "bg-[#c8f169] text-[#12221b]"
                            : "text-white/70 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <Icon
                          size={18}
                          strokeWidth={active ? 2.5 : 2}
                          aria-hidden={true}
                        />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>

          <div className="mt-7 rounded-2xl border border-white/15 bg-white/5 p-3 lg:mt-auto">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4834f] text-xs font-black text-[#12221b]">
                {initials(user.codigo || user.email)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">
                  {user.codigo}
                </p>
                <p className="truncate text-[11px] font-semibold text-white/65">
                  {roleLabels[user.rol]}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              disabled={loggingOut}
              className="focus-ring mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-extrabold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <LogOut size={15} aria-hidden="true" />
              {loggingOut ? "Saliendo…" : "Cerrar sesión"}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="portal-background min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <a
        href="#portal-main"
        className="focus-ring fixed left-4 top-4 z-[60] -translate-y-24 rounded-xl bg-white px-4 py-3 font-black text-[#12221b] shadow-xl transition focus:translate-y-0"
      >
        Saltar al contenido
      </a>
      <aside className="sticky top-0 hidden h-screen flex-col bg-[#12221b] lg:flex">
        {sidebar()}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menú del portal"
            className="relative flex h-full w-[min(86vw,19rem)] flex-col bg-[#12221b] shadow-2xl"
          >
            {sidebar(true)}
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="safe-area-top sticky top-0 z-30 flex min-h-17 items-center justify-between border-b border-[#12221b]/10 bg-[#f7f7f3]/95 px-4 backdrop-blur-xl sm:px-7 lg:justify-end">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            className="focus-ring grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#12221b]/10 bg-white lg:hidden"
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-black">{user.codigo}</p>
              <p className="text-[11px] font-semibold text-[#5f6d66]">
                {user.email}
              </p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#c8f169] text-[11px] font-black">
              {initials(user.codigo || user.email)}
            </span>
          </div>
        </header>
        <main
          id="portal-main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[92rem] px-4 py-7 sm:px-7 sm:py-9 lg:px-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
