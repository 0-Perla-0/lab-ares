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
          <label htmlFor="mfa-code" className="text-sm font-extrabold">
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
            className="mt-2 h-13 w-full rounded-2xl border px-4"
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
              className="text-sm font-extrabold text-[#25256d]"
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
              className="mt-2 h-13 w-full rounded-2xl border border-[#dde1ea] bg-white px-4 text-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#ea580c] focus:ring-4 focus:ring-[#f97316]/25"
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
                className="text-sm font-extrabold text-[#25256d]"
              >
                Contraseña
              </label>
              <Link
                href="/recuperar-contrasena"
                className="focus-ring rounded-md text-xs font-bold text-[#667085] underline hover:text-[#17174a]"
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
                className="h-13 w-full rounded-2xl border border-[#dde1ea] bg-white px-4 pr-12 text-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#ea580c] focus:ring-4 focus:ring-[#f97316]/25"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#667085] hover:bg-[#f6f7fb]"
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
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="focus-ring flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#f97316] px-5 text-base font-black tracking-[-0.035em] text-[#17174a] transition hover:bg-[#ea580c] disabled:cursor-wait disabled:opacity-70 sm:text-lg"
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
