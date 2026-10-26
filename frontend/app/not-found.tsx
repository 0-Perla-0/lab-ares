import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-surface-inset)] px-5 text-center">
      <div>
        <p className="text-sm font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-accent-text)]">
          Error 404
        </p>
        <h1 className="mt-4 text-5xl font-bold tracking-[-0.055em]">
          Esta idea aún no existe.
        </h1>
        <p className="mt-5 text-[var(--color-muted)]">
          La página que buscas no está disponible.
        </p>
        <Link
          href="/"
          className="focus-ring mt-8 inline-flex rounded-full bg-[var(--color-primary)] px-6 py-3 text-sm font-bold text-[var(--color-on-primary)] shadow-[var(--shadow-button)]"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
