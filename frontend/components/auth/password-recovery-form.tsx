"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { apiRequest, getApiErrorMessage } from "@/lib/api";

type Step = "request" | "reset" | "complete";

export function PasswordRecoveryForm() {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function requestToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const requestedEmail = String(formData.get("email") ?? "").trim();

    try {
      await apiRequest("/api/auth/recovery/request", {
        method: "POST",
        body: JSON.stringify({ email: requestedEmail }),
      });
      setEmail(requestedEmail);
      setStep("reset");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");

    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/api/auth/recovery/reset", {
        method: "POST",
        body: JSON.stringify({
          token: String(formData.get("token") ?? "").trim(),
          password,
        }),
      });
      setStep("complete");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setLoading(false);
    }
  }

  if (step === "complete") {
    return (
      <div className="mt-10" role="status" aria-live="polite">
        <div className="rounded-[var(--radius-card-lg)] border border-[var(--color-success-border)] bg-[var(--color-success-soft)] p-6">
          <CheckCircle2
            className="text-[var(--color-success-text)]"
            aria-hidden="true"
          />
          <h3 className="mt-4 text-xl font-bold text-[var(--color-ink)]">
            Contraseña actualizada
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            Ya puedes entrar con tu correo y la contraseña nueva.
          </p>
        </div>
        <Link
          href="/login"
          className="focus-ring group mt-5 flex h-13 w-full items-center justify-center gap-3 rounded-full bg-[var(--color-primary)] px-5 text-sm font-bold text-[var(--color-on-primary)] shadow-[var(--shadow-button)] transition hover:bg-[var(--color-primary-hover)]"
        >
          Ir a iniciar sesión
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={step === "request" ? requestToken : resetPassword}
      className="mt-10 space-y-5"
    >
      {step === "request" ? (
        <div>
          <label
            htmlFor="recovery-email"
            className="text-sm font-medium text-[var(--color-ink)]"
          >
            Correo electrónico
          </label>
          <input
            id="recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="inventor@ejemplo.com"
            className="mt-2 h-13 w-full rounded-[var(--radius-input)] border border-[var(--color-control-border)] bg-[var(--color-surface)] px-4 text-sm outline-none transition placeholder:text-[var(--color-muted)] focus:border-[var(--color-focus)] focus:ring-4 focus:ring-[var(--color-accent-soft)]"
          />
          <p className="mt-3 text-xs leading-5 text-[var(--color-muted)]">
            Si existe una cuenta con ese correo, enviaremos un token de uso
            único.
          </p>
        </div>
      ) : (
        <>
          <div
            className="rounded-[var(--radius-card)] border border-[var(--color-success-border)] bg-[var(--color-success-soft)] px-4 py-3 text-sm leading-6 text-[var(--color-success-text)]"
            role="status"
            aria-live="polite"
          >
            Revisa el correo enviado a <strong>{email}</strong> e introduce el
            token.
          </div>
          <div>
            <label
              htmlFor="recovery-token"
              className="text-sm font-medium text-[var(--color-ink)]"
            >
              Token de recuperación
            </label>
            <input
              id="recovery-token"
              name="token"
              type="text"
              autoComplete="one-time-code"
              minLength={20}
              required
              className="mt-2 h-13 w-full rounded-[var(--radius-input)] border border-[var(--color-control-border)] bg-[var(--color-surface)] px-4 font-mono text-sm outline-none transition focus:border-[var(--color-focus)] focus:ring-4 focus:ring-[var(--color-accent-soft)]"
            />
          </div>
          <div>
            <label
              htmlFor="recovery-password"
              className="text-sm font-medium text-[var(--color-ink)]"
            >
              Nueva contraseña
            </label>
            <input
              id="recovery-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              required
              className="mt-2 h-13 w-full rounded-[var(--radius-input)] border border-[var(--color-control-border)] bg-[var(--color-surface)] px-4 text-sm outline-none transition focus:border-[var(--color-focus)] focus:ring-4 focus:ring-[var(--color-accent-soft)]"
            />
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Mínimo 15 caracteres.
            </p>
          </div>
          <div>
            <label
              htmlFor="recovery-confirmation"
              className="text-sm font-medium text-[var(--color-ink)]"
            >
              Confirmar contraseña
            </label>
            <input
              id="recovery-confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              required
              className="mt-2 h-13 w-full rounded-[var(--radius-input)] border border-[var(--color-control-border)] bg-[var(--color-surface)] px-4 text-sm outline-none transition focus:border-[var(--color-focus)] focus:ring-4 focus:ring-[var(--color-accent-soft)]"
            />
          </div>
        </>
      )}

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-[var(--radius-card)] border border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-danger)]"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="focus-ring group flex h-13 w-full items-center justify-center gap-3 rounded-full bg-[var(--color-primary)] px-5 text-sm font-bold text-[var(--color-on-primary)] shadow-[var(--shadow-button)] transition hover:bg-[var(--color-primary-hover)] disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? (
          <>
            <LoaderCircle
              size={18}
              className="animate-spin"
              aria-hidden="true"
            />
            Procesando…
          </>
        ) : (
          <>
            {step === "request" ? "Enviar token" : "Cambiar contraseña"}
            <ArrowRight size={18} aria-hidden="true" />
          </>
        )}
      </button>

      {step === "reset" && (
        <button
          type="button"
          onClick={() => {
            setError("");
            setStep("request");
          }}
          className="focus-ring w-full rounded-md text-sm font-bold text-[var(--color-accent-text)] hover:text-[var(--color-primary-hover)]"
        >
          Solicitar otro token
        </button>
      )}
    </form>
  );
}
