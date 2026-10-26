"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

import { apiRequest, getApiErrorMessage } from "@/lib/api";
import type { ApiEnvelope } from "@/lib/types";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    try {
      const result = await apiRequest<
        ApiEnvelope<{ mfaRequired?: boolean; challenge?: string }>
      >(
        challenge
          ? `/api/auth/mfa/${recovery ? "recovery" : "verify"}`
          : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify(
            challenge
              ? { challenge, code: formData.get("code") }
              : {
                  email: formData.get("email"),
                  password: formData.get("password"),
                },
          ),
        },
      );
      if (result.data.mfaRequired && result.data.challenge) {
        setChallenge(result.data.challenge);
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "login"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-10 space-y-5">
      {challenge ? (
        <div className="space-y-4">
          <label htmlFor="mfa-code" className="text-sm font-medium">
            {recovery
              ? "Código de recuperación"
              : "Código de tu aplicación autenticadora"}
          </label>
          <input
            id="mfa-code"
            name="code"
            required
            autoComplete="one-time-code"
            inputMode={recovery ? "text" : "numeric"}
            pattern={recovery ? undefined : "[0-9]{6}"}
            maxLength={recovery ? 32 : 6}
            className="mt-2 h-13 w-full rounded-[var(--radius-input)] border border-[var(--color-control-border)] bg-[var(--color-surface)] px-4"
          />
          <button
            type="button"
            className="focus-ring text-sm underline"
            onClick={() => setRecovery((value) => !value)}
          >
            {recovery
              ? "Usar aplicación autenticadora"
              : "Usar un código de recuperación"}
          </button>
          <button
            type="button"
            className="focus-ring ml-4 text-sm underline"
            onClick={() => {
              setChallenge(null);
              setError("");
            }}
          >
            Volver al inicio de sesión
          </button>
        </div>
      ) : (
        <>
          <div>
            <label
              htmlFor="email"
              className="text-sm font-medium text-[var(--color-ink)]"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="inventor@ejemplo.com"
              className="mt-2 h-13 w-full rounded-[var(--radius-input)] border border-[var(--color-control-border)] bg-[var(--color-surface)] px-4 text-sm outline-none transition placeholder:text-[var(--color-muted)] focus:border-[var(--color-focus)] focus:ring-4 focus:ring-[var(--color-accent-soft)]"
            />
          </div>
          <Link
            href="/recuperar"
            className="focus-ring inline-block text-sm font-semibold underline"
          >
            Recuperar acceso
          </Link>
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-sm font-medium text-[var(--color-ink)]"
              >
                Contraseña
              </label>
              <Link
                href="/recuperar-contrasena"
                className="focus-ring rounded-md text-xs font-bold text-[var(--color-muted)] underline hover:text-[var(--color-ink)]"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <div className="relative mt-2">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                maxLength={128}
                placeholder="Tu contraseña"
                className="h-13 w-full rounded-[var(--radius-input)] border border-[var(--color-control-border)] bg-[var(--color-surface)] px-4 pr-12 text-sm outline-none transition placeholder:text-[var(--color-muted)] focus:border-[var(--color-focus)] focus:ring-4 focus:ring-[var(--color-accent-soft)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[var(--color-muted)] hover:bg-[var(--color-surface-inset)]"
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
        className="focus-ring flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-5 text-base font-bold text-[var(--color-on-primary)] shadow-[var(--shadow-button)] transition hover:bg-[var(--color-primary-hover)] disabled:cursor-wait disabled:opacity-70 sm:text-lg"
      >
        {loading ? (
          <>
            <LoaderCircle size={18} className="animate-spin" />
            Ingresando…
          </>
        ) : challenge ? (
          "Verificar y entrar"
        ) : (
          "Ingresar"
        )}
      </button>
    </form>
  );
}
