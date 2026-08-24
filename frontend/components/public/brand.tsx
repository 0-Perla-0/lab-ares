import Link from "next/link";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      href="/"
      className={`focus-ring inline-flex items-center gap-3 rounded-xl ${
        inverse ? "text-white" : "text-[#12221b]"
      }`}
      aria-label="Ares, ir al inicio"
    >
      <span className="brand-mark" aria-hidden="true">
        A
      </span>
      <span className="leading-none">
        <span className="block text-lg font-black tracking-[-0.04em]">
          ARES
        </span>
        <span
          className={`mt-1 block text-[9px] font-bold uppercase tracking-[0.2em] ${
            inverse ? "text-white/55" : "text-[#66736d]"
          }`}
        >
          Laboratorio de Inventores
        </span>
      </span>
    </Link>
  );
}
