import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
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
    <main className="min-h-screen bg-[#f4f0e7] lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="grid-texture relative hidden overflow-hidden bg-[#12221b] p-10 text-white lg:flex lg:flex-col xl:p-14">
        <div className="absolute -bottom-36 -left-24 h-96 w-96 rounded-full bg-[#c8f169]/15 blur-3xl" />
        <Brand inverse />

        <div className="relative my-auto max-w-xl py-16">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#c8f169]">
            Tu espacio de trabajo
          </p>
          <h1 className="mt-5 text-5xl font-black leading-[1.04] tracking-[-0.06em] xl:text-6xl">
            Las grandes ideas también necesitan un buen punto de partida.
          </h1>
          <div className="mt-10 space-y-4">
            {[
              "Consulta tu lugar dentro del equipo",
              "Encuentra sedes, áreas y turnos",
              "Gestiona de acuerdo con tu responsabilidad",
            ].map((benefit) => (
              <div
                key={benefit}
                className="flex items-center gap-3 text-sm text-white/70"
              >
                <CheckCircle2 size={18} className="text-[#c8f169]" />
                {benefit}
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/35">
          Laboratorio de Inventores · Operación interna
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-10 lg:hidden">
            <Brand />
          </div>
          <Link
            href="/"
            className="focus-ring inline-flex rounded-md text-xs font-black uppercase tracking-[0.16em] text-[#769a27] hover:text-[#55721e]"
          >
            ← Volver al inicio
          </Link>
          <h2 className="mt-8 text-4xl font-black tracking-[-0.055em] text-[#12221b] sm:text-5xl">
            Bienvenido de nuevo.
          </h2>
          <p className="mt-4 text-base leading-7 text-[#66736d]">
            Ingresa tus credenciales para continuar al portal.
          </p>
          <LoginForm redirectTo={safeRedirect(params.next)} />
          <p className="mt-8 text-center text-xs leading-5 text-[#7a8580]">
            El acceso es administrado por tu organización. Si no tienes cuenta,
            solicita el alta a tu responsable.
          </p>
        </div>
      </section>
    </main>
  );
}
