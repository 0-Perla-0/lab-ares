"use client";

import { useEffect } from "react";
import Link from "next/link";
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
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-extrabold text-[#32473d]">
      {label}
      {required && <span className="ml-1 text-[#db6531]">*</span>}
      {children}
      {hint && (
        <span className="mt-1.5 block text-xs font-medium text-[#7a8580]">
          {hint}
        </span>
      )}
    </label>
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
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid items-end bg-[#0b1712]/55 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[1.7rem] bg-[#fcfbf7] shadow-2xl sm:max-w-2xl sm:rounded-[1.7rem]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-[#12221b]/10 bg-[#fcfbf7]/95 px-5 py-5 backdrop-blur sm:px-7">
          <div>
            <h2
              id="modal-title"
              className="text-xl font-black tracking-[-0.03em]"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm leading-6 text-[#66736d]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-xl p-2 text-[#66736d] hover:bg-[#eeeee9]"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </header>
        <div className="p-5 sm:p-7">{children}</div>
      </section>
    </div>
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
        className="focus-ring rounded-xl border border-[#12221b]/15 px-5 py-2.5 text-sm font-extrabold hover:bg-[#f0f1ed]"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={saving}
        className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-[#12221b] px-5 py-2.5 text-sm font-black text-white hover:bg-[#243d32] disabled:cursor-wait disabled:opacity-65"
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
}: {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
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
        <p className="text-sm leading-6">
          Esta acción es lógica: el registro dejará de aparecer en el catálogo
          activo.
        </p>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="focus-ring rounded-xl border border-[#12221b]/15 px-5 py-2.5 text-sm font-extrabold"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-2.5 text-sm font-black text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-65"
        >
          {busy && <LoaderCircle size={16} className="animate-spin" />}
          {busy ? "Procesando…" : "Confirmar baja"}
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
    <div className="grid min-h-56 place-items-center rounded-2xl border border-[#12221b]/10 bg-white">
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
          className="focus-ring mt-4 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-black text-white"
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
          Tu rol no cuenta con permisos para consultar esta sección.
        </p>
      </div>
    </div>
  );
}
