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
        <div className="rounded-3xl border border-[#769a27]/25 bg-[#eff7dc] p-6">
          <CheckCircle2 className="text-[#668721]" aria-hidden="true" />
          <h3 className="mt-4 text-xl font-black text-[#12221b]">
            Contraseña actualizada
          </h3>
          <p className="mt-2 text-sm leading-6 text-[#52615a]">
            Ya puedes entrar con tu correo y la contraseña nueva.
          </p>
        </div>
        <Link
          href="/login"
          className="focus-ring group mt-5 flex h-13 w-full items-center justify-center gap-3 rounded-2xl bg-[#12221b] px-5 text-sm font-black text-white transition hover:bg-[#243d32]"
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
            className="text-sm font-extrabold text-[#243d32]"
          >
            Correo electrónico
          </label>
          <input
            id="recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            placeholder="inventor@ejemplo.com"
            className="mt-2 h-13 w-full rounded-2xl border border-[#12221b]/15 bg-white px-4 text-sm outline-none transition placeholder:text-[#9ba59f] focus:border-[#769a27] focus:ring-4 focus:ring-[#c8f169]/25"
          />
          <p className="mt-3 text-xs leading-5 text-[#7a8580]">
            Si existe una cuenta con ese correo, enviaremos un token de uso
            único.
          </p>
        </div>
      ) : (
        <>
          <div
            className="rounded-2xl border border-[#769a27]/20 bg-[#eff7dc] px-4 py-3 text-sm leading-6 text-[#40552a]"
            role="status"
            aria-live="polite"
          >
            Revisa el correo enviado a <strong>{email}</strong> e introduce el
            token.
          </div>
          <div>
            <label
              htmlFor="recovery-token"
              className="text-sm font-extrabold text-[#243d32]"
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
              autoFocus
              className="mt-2 h-13 w-full rounded-2xl border border-[#12221b]/15 bg-white px-4 font-mono text-sm outline-none transition focus:border-[#769a27] focus:ring-4 focus:ring-[#c8f169]/25"
            />
          </div>
          <div>
            <label
              htmlFor="recovery-password"
              className="text-sm font-extrabold text-[#243d32]"
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
              className="mt-2 h-13 w-full rounded-2xl border border-[#12221b]/15 bg-white px-4 text-sm outline-none transition focus:border-[#769a27] focus:ring-4 focus:ring-[#c8f169]/25"
            />
            <p className="mt-2 text-xs text-[#7a8580]">Mínimo 15 caracteres.</p>
          </div>
          <div>
            <label
              htmlFor="recovery-confirmation"
              className="text-sm font-extrabold text-[#243d32]"
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
              className="mt-2 h-13 w-full rounded-2xl border border-[#12221b]/15 bg-white px-4 text-sm outline-none transition focus:border-[#769a27] focus:ring-4 focus:ring-[#c8f169]/25"
            />
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
        className="focus-ring group flex h-13 w-full items-center justify-center gap-3 rounded-2xl bg-[#12221b] px-5 text-sm font-black text-white transition hover:bg-[#243d32] disabled:cursor-wait disabled:opacity-70"
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
          className="focus-ring w-full rounded-md text-sm font-bold text-[#668721] hover:text-[#486217]"
        >
          Solicitar otro token
        </button>
      )}
    </form>
  );
}
