import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, MailCheck, ShieldCheck } from "lucide-react";

import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { Brand } from "@/components/public/brand";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  description: "Restablece el acceso a tu cuenta de Ares.",
};

const stepIconClassName = "text-[var(--color-accent-text)]";

export default function PasswordRecoveryPage() {
  return (
    <main className="min-h-screen bg-[var(--color-canvas)] lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="portal-background relative hidden overflow-hidden border-r border-[var(--color-border)] p-10 text-[var(--color-ink)] lg:flex lg:flex-col xl:p-14">
        <Brand />

        <div className="relative my-auto max-w-xl py-16">
          <p className="text-xs font-medium uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-accent-text)]">
            Recuperación segura
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-[-0.03em] xl:text-[3.25rem]">
            Vuelve a tu espacio de trabajo.
          </h1>
          <div className="mt-10 space-y-5 text-sm text-[var(--color-muted)]">
            <p className="flex items-center gap-3">
              <MailCheck
                size={18}
                className={stepIconClassName}
                aria-hidden="true"
              />
              Recibe un token temporal en tu correo.
            </p>
            <p className="flex items-center gap-3">
              <KeyRound
                size={18}
                className={stepIconClassName}
                aria-hidden="true"
              />
              Define una contraseña nueva.
            </p>
            <p className="flex items-center gap-3">
              <ShieldCheck
                size={18}
                className={stepIconClassName}
                aria-hidden="true"
              />
              Las sesiones anteriores se cierran automáticamente.
            </p>
          </div>
        </div>

        <p className="relative text-xs text-[var(--color-muted)]">
          Laboratorio de Inventores · Operación interna
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-10 lg:hidden">
            <Brand />
          </div>
          <Link
            href="/login"
            className="focus-ring inline-flex rounded-md text-xs font-medium uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-accent-text)] hover:text-[var(--color-primary-hover)]"
          >
            ← Volver al inicio de sesión
          </Link>
          <h2 className="mt-8 text-4xl font-bold tracking-[-0.03em] text-[var(--color-ink)] sm:text-5xl">
            Recupera tu acceso.
          </h2>
          <p className="mt-4 text-base leading-7 text-[var(--color-muted)]">
            Solicita un token y úsalo para establecer una contraseña nueva.
          </p>
          <PasswordRecoveryForm />
        </div>
      </section>
    </main>
  );
}
