"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import { Field, inputClassName } from "@/components/ui/primitives";

export function AccessForm({
  token,
  invitation = false,
}: {
  token?: string;
  invitation?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const element = event.currentTarget;
    try {
      if (invitation && !token) throw new Error("INVITATION_INVALID");
      await apiRequest(
        invitation
          ? `/api/invitations/${encodeURIComponent(token!)}/accept`
          : token
            ? "/api/auth/recovery/reset"
            : "/api/auth/recovery/request",
        {
          method: "POST",
          body: JSON.stringify(
            invitation
              ? { codigo: form.get("codigo"), password: form.get("password") }
              : token
                ? { token, password: form.get("password") }
                : { email: form.get("email") },
          ),
        },
      );
      element.reset();
      setDone(true);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-lg space-y-6 px-5 py-12">
      <h1 className="text-3xl font-black">
        {invitation
          ? "Activar cuenta"
          : token
            ? "Restablecer contraseña"
            : "Recuperar acceso"}
      </h1>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {done ? (
        <p role="status">
          {token
            ? "Operación completada. Inicia sesión con tu contraseña."
            : "Si la cuenta permite recuperación, recibirás un enlace por correo."}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {invitation && (
            <Field label="Código institucional">
              <input
                name="codigo"
                required
                maxLength={50}
                className={inputClassName}
              />
            </Field>
          )}
          {token ? (
            <Field
              label="Nueva contraseña"
              hint="Entre 15 y 128 caracteres; se permiten espacios y Unicode."
            >
              <input
                name="password"
                type="password"
                required
                minLength={15}
                maxLength={128}
                autoComplete="new-password"
                className={inputClassName}
              />
            </Field>
          ) : !invitation ? (
            <Field label="Correo electrónico">
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className={inputClassName}
              />
            </Field>
          ) : (
            <p>Necesitas el enlace privado de tu invitación.</p>
          )}
          <button
            disabled={busy || (invitation && !token)}
            className="focus-ring min-h-11 rounded-xl bg-[#17174a] px-5 text-white disabled:opacity-50"
          >
            {busy ? "Procesando…" : "Continuar"}
          </button>
        </form>
      )}
      <Link href="/login" className="focus-ring inline-block underline">
        Volver al inicio de sesión
      </Link>
    </main>
  );
}
