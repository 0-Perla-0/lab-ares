import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { TermsAndConditions } from "@/components/auth/terms-and-conditions";
import { Brand } from "@/components/public/brand";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Accede al portal operativo de Ares.",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

function safeRedirect(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/portal") ? candidate : "/portal";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="portal-background relative isolate flex min-h-screen min-h-[100svh] items-center justify-center overflow-hidden px-5 py-28 sm:px-10 lg:py-10">
      <div className="absolute left-5 top-5 z-20 sm:left-10 sm:top-10 xl:left-14 xl:top-14">
        <Brand />
      </div>

      <section
        aria-labelledby="login-title"
        className="relative z-10 w-full max-w-[30rem] animate-fade-up rounded-[var(--radius-card-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-float)] sm:p-9"
      >
        <div className="mx-auto h-1.5 w-24 rounded-full bg-[var(--color-accent)]" />
        <div className="mt-7">
          <h1
            id="login-title"
            className="text-center text-4xl font-bold tracking-[-0.03em] text-[var(--color-ink)] sm:text-5xl"
          >
            Bienvenido
          </h1>
          <LoginForm redirectTo={safeRedirect(params.next)} />
          <TermsAndConditions />
        </div>
      </section>
    </main>
  );
}
