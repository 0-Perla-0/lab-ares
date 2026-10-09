import Link from "next/link";
import Image from "next/image";

export function Brand({
  inverse = false,
  compact = false,
}: {
  inverse?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href="/"
      className={`focus-ring inline-flex items-center gap-2 rounded-xl ${
        inverse ? "text-white" : "text-[#17174a]"
      }`}
      aria-label="Ares, ir al inicio"
    >
      <span
        className={`brand-mark ${compact ? "brand-mark-compact" : ""}`}
        aria-hidden="true"
      >
        <Image
          src="/images/ares-inventores.png"
          alt=""
          fill
          sizes="52px"
          loading="eager"
          className="object-contain"
        />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block text-lg font-black tracking-[-0.04em]">
            ARES
          </span>
          <span
            className={`mt-1 block text-[9px] font-bold uppercase tracking-[0.2em] ${
              inverse ? "text-white/55" : "text-[#667085]"
            }`}
          >
            Laboratorio de Inventores
          </span>
        </span>
      )}
    </Link>
  );
}
