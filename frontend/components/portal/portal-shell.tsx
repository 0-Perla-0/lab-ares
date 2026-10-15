"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Building2,
  ChevronDown,
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
import { DegradationBanner } from "./degradation-banner";
import {
  visibleBackend2Navigation,
  type Backend2NavigationItem,
} from "@/lib/backend2/navigation";
import { initials } from "@/lib/format";
import {
  canReadUsers,
  hasPermission,
  permissions,
  roleLabels,
} from "@/lib/permissions";

type NavigationIcon = ComponentType<{
  size?: number | string;
  strokeWidth?: number | string;
  "aria-hidden"?: boolean;
}>;

type NavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: NavigationIcon;
  exact?: boolean;
};

type NavigationGroup = {
  id: string;
  label: string;
  description: string;
  items: NavigationItem[];
};

type TooltipPosition = {
  left: number;
  top: number;
  width: number;
};

function DelayedTooltip({
  description,
  children,
}: {
  description: string;
  children: ReactNode;
}) {
  const tooltipId = useId();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  function hideTooltip() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPosition(null);
  }

  function showTooltipAfterDelay(element: HTMLElement) {
    hideTooltip();
    timerRef.current = setTimeout(() => {
      const rect = element.getBoundingClientRect();
      const gap = 12;
      const preferredWidth = 260;
      const edgeGap = 12;
      const availableRight = window.innerWidth - rect.right - gap - edgeGap;
      const width = Math.max(
        180,
        Math.min(preferredWidth, window.innerWidth - edgeGap * 2),
      );
      const placeOnRight = availableRight >= Math.min(width, 220);
      const left = placeOnRight
        ? Math.min(rect.right + gap, window.innerWidth - width - edgeGap)
        : Math.min(
            Math.max(edgeGap, rect.left),
            window.innerWidth - width - edgeGap,
          );
      const top = placeOnRight
        ? Math.min(
            Math.max(edgeGap, rect.top + rect.height / 2 - 32),
            window.innerHeight - 92,
          )
        : Math.min(rect.bottom + 8, window.innerHeight - 92);

      setPosition({ left, top, width });
      timerRef.current = null;
    }, 1000);
  }

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <div
      className="relative"
      onMouseEnter={(event) => showTooltipAfterDelay(event.currentTarget)}
      onMouseLeave={hideTooltip}
      aria-describedby={position ? tooltipId : undefined}
    >
      {children}
      {position &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[120] rounded-xl border border-white/15 bg-[#25256d] px-3 py-2.5 text-xs font-semibold leading-5 text-white shadow-2xl"
            style={position}
          >
            {description}
          </div>,
          document.body,
        )}
    </div>
  );
}

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
    id: group.id,
    label: group.label,
    description: group.description,
    items: group.items.map((item) => ({
      href: item.href,
      label: item.label,
      description: item.description,
      icon: backend2Icons[item.icon] ?? BookOpen,
    })),
  }));
  const navigationGroups: NavigationGroup[] = [
    {
      id: "workspace",
      label: "Espacio de trabajo",
      description: "Accede al resumen general y registra tu asistencia.",
      items: [
        {
          href: "/portal/seguridad",
          label: "Seguridad",
          description: "Contraseña, sesiones y segundo factor.",
          icon: ShieldCheck,
        },
        {
          href: "/portal/notificaciones",
          label: "Notificaciones",
          description: "Avisos privados y resoluciones.",
          icon: BookOpen,
        },
        ...(hasPermission(user, permissions.ATTENDANCE_MANAGE)
          ? [
              {
                href: "/portal/validaciones",
                label: "Validaciones",
                description: "Revisar, corregir y validar horas.",
                icon: Clock3,
              },
            ]
          : []),
        {
          href: "/portal",
          label: "Resumen",
          description:
            "Consulta indicadores y el estado general de tu espacio de trabajo.",
          icon: LayoutDashboard,
          exact: true,
        },
        {
          href: "/portal/asistencia",
          label: "Asistencia",
          description:
            "Registra entradas y salidas, y consulta el historial de horas.",
          icon: Clock3,
        },
        ...(hasPermission(user, permissions.ABSENCES_SELF)
          ? [
              {
                href: "/portal/asistencia/ausencias",
                label: "Ausencias",
                description:
                  "Justificaciones, aclaraciones y apelaciones privadas.",
                icon: FileText,
              },
            ]
          : []),
        ...(hasPermission(user, permissions.CALENDAR_READ)
          ? [
              {
                href: "/portal/calendario",
                label: "Calendario",
                description: "Turnos y excepciones jerárquicas.",
                icon: Clock3,
              },
            ]
          : []),
      ],
    },
    ...backend2Groups,
    {
      id: "operational",
      label: "Control operativo",
      description: "Visitas, inventario y consolas autorizadas.",
      items: [
        ...(hasPermission(user, permissions.VISITS_REQUEST)
          ? [
              {
                href: "/portal/visitas",
                label: "Visitas",
                description: "Invitaciones privadas de visitantes.",
                icon: UsersRound,
              },
            ]
          : []),
        ...(hasPermission(user, permissions.VISITS_CONTROL)
          ? [
              {
                href: "/portal/visitas/control",
                label: "Control de visitas",
                description: "Identificación física y entradas/salidas.",
                icon: ShieldCheck,
              },
            ]
          : []),
        ...(hasPermission(user, permissions.INVENTORY_READ)
          ? [
              {
                href: "/portal/inventario",
                label: "Inventario",
                description: "Libro mayor y préstamos de activos.",
                icon: Building2,
              },
            ]
          : []),
        ...(hasPermission(user, permissions.AUDIT_READ)
          ? [
              {
                href: "/portal/admin/auditoria",
                label: "Auditoría",
                description: "Eventos e integridad de manifiestos.",
                icon: ShieldCheck,
              },
            ]
          : []),
        ...(hasPermission(user, permissions.OPERATIONS_READ)
          ? [
              {
                href: "/portal/admin/operaciones",
                label: "Operaciones",
                description: "Salud, trabajos e incidentes.",
                icon: BarChart3,
              },
            ]
          : []),
        ...(hasPermission(user, permissions.RECOVERY_READ)
          ? [
              {
                href: "/portal/admin/recuperacion",
                label: "Recuperación",
                description: "Barrera, simulacros y vista previa segura.",
                icon: ShieldCheck,
              },
            ]
          : []),
      ],
    },
    {
      id: "organization",
      label: "Organización",
      description: "Configura sedes, áreas, turnos y usuarios.",
      items: [
        {
          href: "/portal/sedes",
          label: "Sedes",
          description: "Administra los espacios físicos de la organización.",
          icon: Building2,
        },
        {
          href: "/portal/areas",
          label: "Áreas",
          description:
            "Organiza equipos y responsabilidades dentro de cada sede.",
          icon: MapPinned,
        },
        {
          href: "/portal/turnos",
          label: "Turnos",
          description: "Configura horarios y días activos por área.",
          icon: Clock3,
        },
        ...(canReadUsers(user)
          ? [
              {
                href: "/portal/invitaciones",
                label: "Invitaciones",
                description: "Activa accesos sin contraseñas temporales.",
                icon: UsersRound,
              },
              {
                href: "/portal/usuarios",
                label: "Usuarios",
                description:
                  "Consulta, registra y administra accesos del equipo.",
                icon: UsersRound,
              },
            ]
          : []),
      ],
    },
  ];
  const activeGroupId = navigationGroups.find((group) =>
    group.items.some(({ href, exact }) =>
      exact
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`),
    ),
  )?.id;
  const [openGroupId, setOpenGroupId] = useState<string | null>(
    activeGroupId ?? "workspace",
  );

  useEffect(() => {
    if (activeGroupId) setOpenGroupId(activeGroupId);
  }, [activeGroupId]);

  function sidebar(mobile = false) {
    const sidebarId = mobile ? "mobile" : "desktop";
    const collapsed = !mobile && sidebarCollapsed;
    const toggleLabel = collapsed
      ? "Mostrar barra lateral"
      : "Ocultar barra lateral";

    return (
      <>
        <div
          className={`safe-area-top flex min-h-20 items-center border-b border-white/10 ${
            collapsed
              ? "justify-center gap-1 px-2"
              : "justify-between gap-2 px-3"
          }`}
        >
          <Brand inverse compact={collapsed} />
          {mobile ? (
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setMenuOpen(false)}
              className="focus-ring grid min-h-11 min-w-11 place-items-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar menú"
            >
              <X size={20} aria-hidden="true" />
            </button>
          ) : (
            <DelayedTooltip description={toggleLabel}>
              <button
                type="button"
                onClick={() => setSidebarCollapsed((current) => !current)}
                className="focus-ring grid min-h-10 min-w-10 place-items-center rounded-xl border border-white/30 bg-white/5 text-white transition hover:border-white/60 hover:bg-white/15"
                aria-label={toggleLabel}
                aria-expanded={!collapsed}
              >
                <Menu size={20} strokeWidth={2.6} aria-hidden="true" />
              </button>
            </DelayedTooltip>
          )}
        </div>

        {!collapsed && (
          <div className="safe-area-bottom flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-5">
            <nav className="space-y-3" aria-label="Navegación del portal">
              {navigationGroups
                .filter((group) => group.items.length > 0)
                .map((group) => {
                  const expanded = openGroupId === group.id;
                  const groupHasActiveItem = group.id === activeGroupId;
                  const contentId = `${sidebarId}-${group.id}-navigation`;

                  return (
                    <section key={group.id} aria-label={group.label}>
                      <DelayedTooltip description={group.description}>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenGroupId((current) =>
                              current === group.id ? null : group.id,
                            )
                          }
                          aria-expanded={expanded}
                          aria-controls={contentId}
                          className={`focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 text-left text-sm font-extrabold tracking-normal transition hover:border-[#f97316] hover:bg-[#f97316]/10 hover:text-[#fb923c] ${
                            expanded
                              ? "border-white/15 bg-white/10 text-white shadow-sm"
                              : groupHasActiveItem
                                ? "border-white/10 bg-white/5 text-white"
                                : "border-transparent text-white/80"
                          }`}
                        >
                          <span>{group.label}</span>
                          <ChevronDown
                            size={17}
                            strokeWidth={2.5}
                            aria-hidden="true"
                            className={`shrink-0 transition-transform duration-200 ${
                              expanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </DelayedTooltip>
                      <div
                        id={contentId}
                        aria-hidden={!expanded}
                        inert={!expanded}
                        className={`grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none ${
                          expanded
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0"
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="space-y-1.5 pt-2">
                            {group.items.map(
                              ({
                                href,
                                label,
                                description,
                                icon: Icon,
                                exact,
                              }) => {
                                const active = exact
                                  ? pathname === href
                                  : pathname === href ||
                                    pathname.startsWith(`${href}/`);
                                return (
                                  <DelayedTooltip
                                    key={href}
                                    description={description}
                                  >
                                    <Link
                                      href={href}
                                      aria-current={active ? "page" : undefined}
                                      onClick={() => setMenuOpen(false)}
                                      className={`focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-extrabold transition ${
                                        active
                                          ? "bg-[#f97316] text-[#17174a]"
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
                                  </DelayedTooltip>
                                );
                              },
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                })}
            </nav>

            <div className="mt-7 rounded-2xl border border-white/15 bg-white/5 p-3 lg:mt-auto">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fb923c] text-xs font-black text-[#17174a]">
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
        )}
      </>
    );
  }

  return (
    <div
      className={`portal-background min-h-screen transition-[grid-template-columns] duration-300 motion-reduce:transition-none lg:grid ${
        sidebarCollapsed
          ? "lg:grid-cols-[8rem_1fr]"
          : "lg:grid-cols-[17rem_1fr]"
      }`}
    >
      <a
        href="#portal-main"
        className="focus-ring fixed left-4 top-4 z-[60] -translate-y-24 rounded-xl bg-white px-4 py-3 font-black text-[#17174a] shadow-xl transition focus:translate-y-0"
      >
        Saltar al contenido
      </a>
      <aside
        className={`sticky top-0 hidden h-screen flex-col bg-[#17174a] lg:flex ${
          sidebarCollapsed ? "border-r border-white/40" : ""
        }`}
      >
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
            className="relative flex h-full w-[min(86vw,19rem)] flex-col bg-[#17174a] shadow-2xl"
          >
            {sidebar(true)}
          </aside>
        </div>
      )}

      <div className="min-w-0">
        <header className="safe-area-top sticky top-0 z-30 flex min-h-17 items-center justify-between border-b border-[#dde1ea] bg-[#f6f7fb]/95 px-4 backdrop-blur-xl sm:px-7 lg:justify-end">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            className="focus-ring grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#dde1ea] bg-white lg:hidden"
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-black">{user.codigo}</p>
              <p className="text-[11px] font-semibold text-[#667085]">
                {user.email}
              </p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f97316] text-[11px] font-black">
              {initials(user.codigo || user.email)}
            </span>
          </div>
        </header>
        <main
          id="portal-main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[92rem] px-4 py-7 sm:px-7 sm:py-9 lg:px-10"
        >
          <DegradationBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
