"use client";

import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Inbox,
  LoaderCircle,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";

export const inputClassName =
  "mt-2 h-11 w-full rounded-xl border border-[#12221b]/15 bg-white px-3.5 text-sm text-[#12221b] outline-none transition placeholder:text-[#9ba59f] focus:border-[#769a27] focus:ring-4 focus:ring-[#c8f169]/20 disabled:cursor-not-allowed disabled:bg-[#f0f1ed] disabled:text-[#8b948f]";

export const textareaClassName =
  "mt-2 min-h-24 w-full resize-y rounded-xl border border-[#12221b]/15 bg-white px-3.5 py-3 text-sm text-[#12221b] outline-none transition placeholder:text-[#9ba59f] focus:border-[#769a27] focus:ring-4 focus:ring-[#c8f169]/20";

const touchButtonClassName = "min-h-11";

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

const statusToneClass: Record<StatusTone, string> = {
  neutral: "border-[#12221b]/15 bg-[#f0f1ed] text-[#32473d]",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  danger: "border-red-200 bg-red-50 text-red-800",
};

export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: StatusTone;
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-extrabold ${statusToneClass[tone]}`}
    >
      <span
        className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

export function FilterActionBar({
  children,
  actions,
  label = "Filtros y acciones",
}: {
  children: ReactNode;
  actions?: ReactNode;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className="flex flex-col gap-4 rounded-2xl border border-[var(--ares-border)] bg-[var(--ares-surface)] p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between"
    >
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {children}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </section>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-[var(--ares-border)] bg-[var(--ares-surface)] shadow-sm ${className}`}
    >
      {(title || description || action) && (
        <header className="flex flex-col gap-3 border-b border-[var(--ares-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h2 className="text-lg font-black">{title}</h2>}
            {description && (
              <p className="mt-1 text-sm leading-6 text-[var(--ares-muted)]">
                {description}
              </p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className="min-w-0 p-5">{children}</div>
    </section>
  );
}

export function ResponsiveList({
  children,
  label,
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div
      role="list"
      aria-label={label}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {children}
    </div>
  );
}

export function ResponsiveListItem({ children }: { children: ReactNode }) {
  return (
    <article
      role="listitem"
      className="min-w-0 rounded-2xl border border-[var(--ares-border)] bg-[var(--ares-surface)] p-4 shadow-sm"
    >
      {children}
    </article>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return (
    <nav
      aria-label="Paginación"
      className="flex flex-col gap-3 border-t border-[var(--ares-border)] pt-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p
        className="text-sm font-semibold text-[var(--ares-muted)]"
        aria-live="polite"
      >
        Página {safePage} de {totalPages} · {total} resultado
        {total === 1 ? "" : "s"}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={disabled || safePage <= 1}
          className={`focus-ring ${touchButtonClassName} rounded-xl border border-[var(--ares-border-strong)] px-4 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-45`}
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={disabled || safePage >= totalPages}
          className={`focus-ring ${touchButtonClassName} rounded-xl border border-[var(--ares-border-strong)] px-4 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-45`}
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?:
    | { label: string; onClick: () => void; href?: never }
    | { label: string; href: string; onClick?: never };
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.19em] text-[#769a27]">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66736d]">
          {description}
        </p>
      </div>
      {action &&
        (action.href !== undefined ? (
          <Link
            href={action.href}
            className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#12221b] px-4 py-3 text-sm font-black text-white transition hover:bg-[#243d32]"
          >
            <Plus size={17} /> {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#12221b] px-4 py-3 text-sm font-black text-white transition hover:bg-[#243d32]"
          >
            <Plus size={17} /> {action.label}
          </button>
        ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  id,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
  required?: boolean;
  children: ReactElement<{
    id?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
  }>;
}) {
  const generatedId = useId();
  const fieldId = id ?? `field-${generatedId.replaceAll(":", "")}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="block text-sm font-extrabold text-[#32473d]">
      <label htmlFor={fieldId}>
        {label}
        {required && (
          <span className="ml-1 text-[#b94d1f]" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (obligatorio)</span>}
      </label>
      {cloneElement(children, {
        id: fieldId,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
      })}
      {hint && (
        <span
          id={hintId}
          className="mt-1.5 block text-xs font-medium text-[#5f6d66]"
        >
          {hint}
        </span>
      )}
      {error && (
        <span
          id={errorId}
          className="mt-1.5 block text-xs font-bold text-red-700"
        >
          {error}
        </span>
      )}
    </div>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    });
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid items-end overflow-y-auto overscroll-contain bg-[#0b1712]/55 px-0 pb-0 pt-4 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-[1.7rem] bg-[#fcfbf7] shadow-2xl sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-2xl sm:rounded-[1.7rem]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-[#12221b]/10 bg-[#fcfbf7]/95 px-5 py-5 backdrop-blur sm:px-7">
          <div>
            <h2 id={titleId} className="text-xl font-black tracking-[-0.03em]">
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className="mt-1 text-sm leading-6 text-[#66736d]"
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring grid min-h-11 min-w-11 place-items-center rounded-xl text-[#66736d] hover:bg-[#eeeee9]"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </header>
        <div className="p-5 sm:p-7">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

export function FormActions({
  saving,
  submitLabel,
  onCancel,
}: {
  saving: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="mt-7 flex flex-col-reverse gap-3 border-t border-[#12221b]/10 pt-5 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="focus-ring min-h-11 rounded-xl border border-[#12221b]/15 px-5 text-sm font-extrabold hover:bg-[#f0f1ed]"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={saving}
        className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#12221b] px-5 text-sm font-black text-white hover:bg-[#243d32] disabled:cursor-wait disabled:opacity-65"
      >
        {saving && <LoaderCircle size={16} className="animate-spin" />}
        {saving ? "Guardando…" : submitLabel}
      </button>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  busy,
  onClose,
  onConfirm,
  confirmLabel = "Confirmar baja",
  notice = "Esta acción es lógica: el registro dejará de aparecer en el catálogo activo.",
}: {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  notice?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
    >
      <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900">
        <AlertTriangle size={20} className="mt-0.5 shrink-0" />
        <p className="text-sm leading-6">{notice}</p>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="focus-ring min-h-11 rounded-xl border border-[#12221b]/15 px-5 text-sm font-extrabold"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-5 text-sm font-black text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-65"
        >
          {busy && <LoaderCircle size={16} className="animate-spin" />}
          {busy ? "Procesando…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
    >
      {message}
    </div>
  );
}

export function LoadingTable() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="grid min-h-56 place-items-center rounded-2xl border border-[#12221b]/10 bg-white"
    >
      <div className="text-center text-[#66736d]">
        <LoaderCircle
          size={25}
          className="mx-auto animate-spin text-[#769a27]"
        />
        <p className="mt-3 text-sm font-bold">Cargando información…</p>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-[#12221b]/20 bg-white px-6 text-center">
      <div>
        <Inbox size={28} className="mx-auto text-[#95a19a]" />
        <p className="mt-3 font-black">{title}</p>
        <p className="mt-1 text-sm text-[#66736d]">{description}</p>
      </div>
    </div>
  );
}

export function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="grid min-h-56 place-items-center rounded-2xl border border-red-200 bg-red-50 px-6 text-center">
      <div>
        <AlertTriangle size={28} className="mx-auto text-red-600" />
        <p className="mt-3 font-black text-red-900">
          No pudimos cargar esta sección
        </p>
        <p className="mt-1 text-sm text-red-700">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="focus-ring mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-black text-white"
        >
          <RefreshCw size={15} /> Reintentar
        </button>
      </div>
    </div>
  );
}

export function ForbiddenState() {
  return (
    <div className="grid min-h-[55vh] place-items-center text-center">
      <div className="max-w-md">
        <AlertTriangle size={34} className="mx-auto text-amber-600" />
        <h1 className="mt-4 text-3xl font-black tracking-[-0.04em]">
          Acceso restringido
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#66736d]">
          Tu cuenta no cuenta con permisos para consultar esta sección.
        </p>
      </div>
    </div>
  );
}
