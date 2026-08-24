import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f0e7] px-5 text-center">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.2em] text-[#769a27]">
          Error 404
        </p>
        <h1 className="mt-4 text-5xl font-black tracking-[-0.055em]">
          Esta idea aún no existe.
        </h1>
        <p className="mt-5 text-[#66736d]">
          La página que buscas no está disponible.
        </p>
        <Link
          href="/"
          className="focus-ring mt-8 inline-flex rounded-full bg-[#12221b] px-6 py-3 text-sm font-black text-white"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
