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
      className={`focus-ring inline-flex items-center gap-2 rounded-lg ${
        inverse ? "text-white" : "text-[var(--color-ink)]"
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
          <span className="block text-lg font-bold tracking-[-0.03em]">
            ARES
          </span>
          <span
            className={`mt-1 block max-[420px]:hidden text-[11px] font-medium uppercase tracking-[var(--tracking-eyebrow)] ${
              inverse ? "text-white/55" : "text-[var(--color-muted)]"
            }`}
          >
            Laboratorio de Inventores
          </span>
        </span>
      )}
    </Link>
  );
}
