"use client";

import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Boxes,
  ContactRound,
  FileText,
  FolderKanban,
  GraduationCap,
  Library,
  Newspaper,
  Printer,
  ShieldCheck,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { EmptyState } from "@/components/ui/primitives";
import {
  visibleBackend2Navigation,
  type Backend2NavigationItem,
} from "@/lib/backend2/navigation";

const icons: Record<Backend2NavigationItem["icon"], LucideIcon> = {
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

export function Backend2Hub() {
  const { user } = useAuth();
  const groups = visibleBackend2Navigation(user);

  if (!groups.length) {
    return (
      <EmptyState
        title="No hay módulos disponibles"
        description="Tu cuenta no tiene permisos explícitos para los módulos de esta sección."
      />
    );
  }

  return (
    <div className="space-y-7">
      {groups.map((group, groupIndex) => {
        const headingId = `backend2-hub-group-${groupIndex}`;
        return (
          <section key={group.label} aria-labelledby={headingId}>
            <div className="mb-3 flex items-center gap-2">
              <Boxes size={18} aria-hidden="true" />
              <h2
                id={headingId}
                className="text-sm font-black uppercase tracking-[0.12em] text-[var(--ares-muted)]"
              >
                {group.label}
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => {
                const Icon = icons[item.icon] ?? BookOpen;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="focus-ring group min-h-32 rounded-2xl border border-[var(--ares-border)] bg-[var(--ares-surface)] p-5 shadow-sm transition hover:border-[var(--ares-border-strong)] hover:shadow-md"
                  >
                    <Icon
                      size={22}
                      className="text-[var(--ares-focus)]"
                      aria-hidden="true"
                    />
                    <h3 className="mt-4 font-black">{item.label}</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--ares-muted)]">
                      {item.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
