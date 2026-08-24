"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";

import { apiRequest, getApiErrorMessage } from "@/lib/api";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    try {
      await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });
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
      <div>
        <label
          htmlFor="email"
          className="text-sm font-extrabold text-[#243d32]"
        >
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          placeholder="inventor@ejemplo.com"
          className="mt-2 h-13 w-full rounded-2xl border border-[#12221b]/15 bg-white px-4 text-sm outline-none transition placeholder:text-[#9ba59f] focus:border-[#769a27] focus:ring-4 focus:ring-[#c8f169]/25"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label
            htmlFor="password"
            className="text-sm font-extrabold text-[#243d32]"
          >
            Contraseña
          </label>
          <span className="text-xs font-semibold text-[#7a8580]">
            Acceso seguro
          </span>
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
            className="h-13 w-full rounded-2xl border border-[#12221b]/15 bg-white px-4 pr-12 text-sm outline-none transition placeholder:text-[#9ba59f] focus:border-[#769a27] focus:ring-4 focus:ring-[#c8f169]/25"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#66736d] hover:bg-[#f4f0e7]"
            aria-label={
              showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
            }
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

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
            <LoaderCircle size={18} className="animate-spin" />
            Iniciando sesión…
          </>
        ) : (
          <>
            Entrar a Ares
            <ArrowRight
              size={18}
              className="transition group-hover:translate-x-1"
            />
          </>
        )}
      </button>
    </form>
  );
}
