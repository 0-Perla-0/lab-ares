import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Clock3, UsersRound } from "lucide-react";

import { PublicFooter } from "@/components/public/footer";
import { PublicHeader } from "@/components/public/header";

export const metadata: Metadata = {
  title: "Organización que impulsa ideas",
};

const capabilities = [
  {
    icon: Building2,
    number: "01",
    title: "Una estructura clara",
    body: "Sedes y áreas conectadas en un solo lugar para que cada equipo sepa dónde está y con quién colabora.",
  },
  {
    icon: Clock3,
    number: "02",
    title: "Turnos bajo control",
    body: "Horarios y días de trabajo visibles, ordenados y listos para acompañar la operación diaria.",
  },
  {
    icon: UsersRound,
    number: "03",
    title: "Personas bien coordinadas",
    body: "Accesos y responsabilidades según el rol de cada integrante, desde prestadores hasta administradores.",
  },
];

export default function HomePage() {
  return (
    <>
      <PublicHeader />
      <main>
        <section className="grid-texture relative overflow-hidden border-b border-[#12221b]/10 bg-[#f4f0e7]">
          <div className="absolute -right-28 top-20 h-80 w-80 rounded-full bg-[#c8f169]/55 blur-3xl" />
          <div className="relative mx-auto grid min-h-[680px] max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-10">
            <div className="max-w-3xl animate-fade-up">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#12221b]/15 bg-white/60 px-4 py-2 text-xs font-black uppercase tracking-[0.17em] text-[#435249]">
                <span className="h-2 w-2 rounded-full bg-[#95c62d]" />
                Operación con propósito
              </div>
              <h1 className="mt-7 text-balance text-5xl font-black leading-[0.98] tracking-[-0.065em] text-[#12221b] sm:text-7xl lg:text-[5.6rem]">
                Donde las ideas encuentran
                <span className="relative ml-[0.18em] inline-block">
                  orden.
                  <span className="absolute -bottom-2 left-0 -z-10 h-5 w-full -rotate-1 rounded-sm bg-[#c8f169]" />
                </span>
              </h1>
              <p className="mt-8 max-w-2xl text-lg leading-8 text-[#536159] sm:text-xl">
                Ares conecta personas, espacios y horarios para que el
                Laboratorio de Inventores dedique menos tiempo a coordinar y más
                tiempo a crear.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  href="/login"
                  className="focus-ring group inline-flex items-center gap-3 rounded-full bg-[#12221b] px-7 py-4 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#243d32]"
                >
                  Acceder a Ares
                  <ArrowRight
                    size={17}
                    className="transition group-hover:translate-x-1"
                  />
                </Link>
                <Link
                  href="/#plataforma"
                  className="focus-ring rounded-full border border-[#12221b]/20 px-7 py-4 text-sm font-black transition hover:bg-white/60"
                >
                  Conocer la plataforma
                </Link>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div className="relative rotate-2 rounded-[2rem] bg-[#12221b] p-5 shadow-[0_32px_80px_rgba(18,34,27,0.22)]">
                <div className="rounded-[1.4rem] border border-white/10 bg-[#1a2e25] p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                        Espacio de trabajo
                      </p>
                      <p className="mt-2 text-xl font-black">Todo en orden</p>
                    </div>
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#c8f169] font-black text-[#12221b]">
                      A
                    </span>
                  </div>
                  <div className="mt-8 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/7 p-4">
                      <p className="text-xs text-white/45">Equipo</p>
                      <p className="mt-2 text-3xl font-black">Conectado</p>
                    </div>
                    <div className="rounded-2xl bg-[#c8f169] p-4 text-[#12221b]">
                      <p className="text-xs font-bold opacity-60">Operación</p>
                      <p className="mt-2 text-3xl font-black">Activa</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-2xl bg-white/7 p-4">
                    <div className="flex items-center justify-between text-xs text-white/50">
                      <span>Organización</span>
                      <span>100%</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/10">
                      <div className="h-full w-full rounded-full bg-[#f4834f]" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-7 -left-6 -rotate-3 rounded-2xl border border-[#12221b]/10 bg-white p-4 shadow-xl">
                <p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#66736d]">
                  Estado
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm font-black">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#95c62d]" />
                  Equipo sincronizado
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="plataforma" className="bg-[#fcfbf7] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#769a27]">
                  La plataforma
                </p>
                <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.05em] sm:text-5xl">
                  Lo complejo se vuelve visible.
                </h2>
              </div>
              <p className="max-w-2xl text-lg leading-8 text-[#66736d] lg:justify-self-end">
                Diseñamos una experiencia directa: información útil, acciones
                precisas y permisos que respetan la estructura del equipo.
              </p>
            </div>

            <div className="mt-16 grid gap-5 md:grid-cols-3">
              {capabilities.map(({ icon: Icon, number, title, body }) => (
                <article
                  key={number}
                  className="group rounded-[1.7rem] border border-[#12221b]/10 bg-white p-7 transition hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(18,34,27,0.09)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#eef8d5] text-[#55721e]">
                      <Icon size={23} strokeWidth={2.2} />
                    </span>
                    <span className="text-xs font-black text-[#a0aaa4]">
                      {number}
                    </span>
                  </div>
                  <h3 className="mt-8 text-xl font-black tracking-[-0.025em]">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[#66736d]">
                    {body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="bg-[#c8f169] py-24 sm:py-28">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:px-10">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#55721e]">
                Así de simple
              </p>
              <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.055em] sm:text-6xl">
                Entra. Ubícate. Avanza.
              </h2>
            </div>
            <div className="space-y-4">
              {[
                "Tu perfil muestra tu lugar en el equipo.",
                "El catálogo mantiene clara la organización.",
                "Cada rol ve y gestiona exactamente lo necesario.",
              ].map((item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-4 rounded-2xl border border-[#12221b]/10 bg-[#12221b] p-5 text-white"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-black text-[#c8f169]">
                    {index + 1}
                  </span>
                  <p className="text-sm font-bold sm:text-base">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="nosotros" className="bg-[#f4f0e7] py-24 sm:py-32">
          <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#769a27]">
              Laboratorio de Inventores
            </p>
            <h2 className="mt-5 text-4xl font-black tracking-[-0.055em] sm:text-6xl">
              La organización también es una forma de inventar.
            </h2>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#66736d]">
              Ares nace para sostener el trabajo de quienes imaginan, coordinan
              y construyen. Una base común para que las buenas ideas tengan
              espacio para crecer.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
