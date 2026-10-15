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
    <main className="grid-texture relative isolate flex min-h-screen min-h-[100svh] items-center justify-center overflow-hidden bg-[#17174a] px-5 py-28 sm:px-10 lg:py-10">
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-[#f97316]/18 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 -top-44 h-[32rem] w-[32rem] rounded-full bg-[#25256d] blur-3xl" />

      <div className="absolute left-5 top-5 z-20 sm:left-10 sm:top-10 xl:left-14 xl:top-14">
        <Brand inverse />
      </div>

      <section
        aria-labelledby="login-title"
        className="relative z-10 w-full max-w-[30rem] animate-fade-up rounded-[2rem] border border-white/25 bg-white p-6 shadow-[0_32px_90px_rgba(5,5,35,0.42)] sm:p-9"
      >
        <div className="mx-auto h-1.5 w-40 rounded-full bg-[#f97316]" />
        <div className="mt-7">
          <h1
            id="login-title"
            className="text-center text-4xl font-black tracking-[-0.055em] text-[#17174a] sm:text-5xl"
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
