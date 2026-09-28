import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, MailCheck, ShieldCheck } from "lucide-react";

import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { Brand } from "@/components/public/brand";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  description: "Restablece el acceso a tu cuenta de Ares.",
};

export default function PasswordRecoveryPage() {
  return (
    <main className="min-h-screen bg-[#f4f0e7] lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="grid-texture relative hidden overflow-hidden bg-[#12221b] p-10 text-white lg:flex lg:flex-col xl:p-14">
        <div className="absolute -bottom-36 -left-24 h-96 w-96 rounded-full bg-[#c8f169]/15 blur-3xl" />
        <Brand inverse />

        <div className="relative my-auto max-w-xl py-16">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#c8f169]">
            Recuperación segura
          </p>
          <h1 className="mt-5 text-5xl font-black leading-[1.04] tracking-[-0.06em] xl:text-6xl">
            Vuelve a tu espacio de trabajo.
          </h1>
          <div className="mt-10 space-y-5 text-sm text-white/70">
            <p className="flex items-center gap-3">
              <MailCheck size={18} className="text-[#c8f169]" />
              Recibe un token temporal en tu correo.
            </p>
            <p className="flex items-center gap-3">
              <KeyRound size={18} className="text-[#c8f169]" />
              Define una contraseña nueva.
            </p>
            <p className="flex items-center gap-3">
              <ShieldCheck size={18} className="text-[#c8f169]" />
              Las sesiones anteriores se cierran automáticamente.
            </p>
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
            href="/login"
            className="focus-ring inline-flex rounded-md text-xs font-black uppercase tracking-[0.16em] text-[#769a27] hover:text-[#55721e]"
          >
            ← Volver al inicio de sesión
          </Link>
          <h2 className="mt-8 text-4xl font-black tracking-[-0.055em] text-[#12221b] sm:text-5xl">
            Recupera tu acceso.
          </h2>
          <p className="mt-4 text-base leading-7 text-[#66736d]">
            Solicita un token y úsalo para establecer una contraseña nueva.
          </p>
          <PasswordRecoveryForm />
        </div>
      </section>
    </main>
  );
}
