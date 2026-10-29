import type { Metadata } from "next";
import { Building2, Clock3, UsersRound } from "lucide-react";

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

const steps = [
  "Tu perfil muestra tu lugar en el equipo.",
  "El catálogo mantiene clara la organización.",
  "Cada rol ve y gestiona exactamente lo necesario.",
];

const eyebrow =
  "text-xs font-medium uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-accent-text)]";

export default function HomePage() {
  return (
    <>
      <PublicHeader />
      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_85%_35%,color-mix(in_srgb,var(--color-accent)_12%,transparent),transparent_26rem)]"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:py-28">
            <div className="max-w-3xl animate-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-medium uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-muted)]">
                <span
                  className="h-2 w-2 rounded-full bg-[var(--color-accent)]"
                  aria-hidden="true"
                />
                Operación con propósito
              </p>
              <h1 className="mt-7 text-balance text-4xl font-bold leading-[1.08] tracking-[-0.03em] sm:text-5xl lg:text-[3.25rem]">
                Donde las ideas encuentran{" "}
                <span className="text-[var(--color-accent-text)]">orden.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-[1.63] text-[var(--color-muted)] sm:text-lg">
                Ares conecta personas, espacios y horarios para que el
                Laboratorio de Inventores dedique menos tiempo a coordinar y más
                tiempo a crear.
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div
                aria-hidden="true"
                className="overflow-hidden rounded-[var(--radius-card-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-float)]"
              >
                <div className="flex items-center gap-1.5 border-b border-[var(--color-border)] px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-border-strong)]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-border-strong)]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-border-strong)]" />
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={eyebrow}>Espacio de trabajo</p>
                      <p className="mt-2 text-xl font-bold">Todo en orden</p>
                    </div>
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-primary)] font-bold text-[var(--color-on-primary)]">
                      A
                    </span>
                  </div>
                  <div className="mt-8 grid grid-cols-2 gap-3">
                    <div className="rounded-[var(--radius-card)] bg-[var(--color-surface-inset)] p-4">
                      <p className="text-xs text-[var(--color-muted)]">
                        Equipo
                      </p>
                      <p className="mt-2 text-2xl font-bold">Conectado</p>
                    </div>
                    <div className="rounded-[var(--radius-card)] bg-[var(--color-accent-soft)] p-4">
                      <p className="text-xs text-[var(--color-muted)]">
                        Operación
                      </p>
                      <p className="mt-2 text-2xl font-bold text-[var(--color-accent-text)]">
                        Activa
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-[var(--radius-card)] bg-[var(--color-surface-inset)] p-4">
                    <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                      <span>Organización</span>
                      <span>100%</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-[var(--color-border)]">
                      <div className="h-full w-full rounded-full bg-[var(--color-accent)]" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-float)] sm:-left-8">
                <p className="text-xs font-medium uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-muted)]">
                  Estado
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm font-bold">
                  <span
                    className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]"
                    aria-hidden="true"
                  />
                  Equipo sincronizado
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="plataforma" className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
              <div>
                <p className={eyebrow}>La plataforma</p>
                <h2 className="mt-4 text-3xl font-bold leading-tight tracking-[-0.025em] sm:text-4xl">
                  Lo complejo se vuelve visible.
                </h2>
              </div>
              <p className="max-w-2xl text-base leading-[1.63] text-[var(--color-muted)] sm:text-lg lg:justify-self-end">
                Diseñamos una experiencia directa: información útil, acciones
                precisas y permisos que respetan la estructura del equipo.
              </p>
            </div>

            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {capabilities.map(({ icon: Icon, number, title, body }) => (
                <article
                  key={number}
                  className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]">
                      <Icon size={22} strokeWidth={2} aria-hidden={true} />
                    </span>
                    <span className="text-xs font-medium text-[var(--color-muted)]">
                      {number}
                    </span>
                  </div>
                  <h3 className="mt-8 text-xl font-bold tracking-[-0.015em]">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-[1.63] text-[var(--color-muted)]">
                    {body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="como-funciona"
          className="border-t border-[var(--color-border)] py-20 sm:py-24"
        >
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
            <div>
              <p className={eyebrow}>Así de simple</p>
              <h2 className="mt-4 text-3xl font-bold leading-tight tracking-[-0.025em] sm:text-4xl">
                Entra. Ubícate. Avanza.
              </h2>
            </div>
            <ol className="space-y-3">
              {steps.map((item, index) => (
                <li
                  key={item}
                  className="flex items-center gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-[var(--color-on-primary)]"
                  >
                    {index + 1}
                  </span>
                  <p className="text-sm font-medium sm:text-base">{item}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="nosotros"
          className="border-t border-[var(--color-border)] py-20 sm:py-24"
        >
          <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
            <p className={eyebrow}>Laboratorio de Inventores</p>
            <h2 className="mt-5 text-3xl font-bold tracking-[-0.03em] sm:text-5xl">
              La organización también es una forma de inventar.
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-[1.63] text-[var(--color-muted)] sm:text-lg">
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
