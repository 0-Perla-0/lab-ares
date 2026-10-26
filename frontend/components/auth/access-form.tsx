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
    <main className="mx-4 my-12 max-w-lg space-y-6 rounded-[var(--radius-card-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:mx-auto sm:p-9">
      <h1 className="text-3xl font-bold tracking-[-0.02em]">
        {invitation
          ? "Activar cuenta"
          : token
            ? "Restablecer contraseña"
            : "Recuperar acceso"}
      </h1>
      {error && (
        <p role="alert" className="text-[var(--color-danger)]">
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
            className="focus-ring min-h-11 rounded-full bg-[var(--color-primary)] px-5 text-sm font-bold text-[var(--color-on-primary)] shadow-[var(--shadow-button)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {busy ? "Procesando…" : "Continuar"}
          </button>
        </form>
      )}
      <Link
        href="/login"
        className="focus-ring inline-block rounded-md text-sm font-medium text-[var(--color-accent-text)] underline underline-offset-4 hover:text-[var(--color-primary-hover)]"
      >
        Volver al inicio de sesión
      </Link>
    </main>
  );
}
