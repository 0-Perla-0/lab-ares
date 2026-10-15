"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import {
  Field,
  FormActions,
  Modal,
  inputClassName,
} from "@/components/ui/primitives";

export function ReauthenticationDialog() {
  const [factor, setFactor] = useState<"password" | "mfa" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const close = useCallback(() => {
    if (!busy) {
      setFactor(null);
      setError("");
    }
  }, [busy]);
  useEffect(() => {
    const handle = (event: Event) => {
      setFactor(
        (event as CustomEvent).detail?.factor === "mfa" ? "mfa" : "password",
      );
      setError("");
      setNotice("");
    };
    window.addEventListener("ares:reauthenticate", handle);
    return () => window.removeEventListener("ares:reauthenticate", handle);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/auth/reauthenticate", {
        method: "POST",
        body: JSON.stringify(body),
      });
      form.reset();
      setFactor(null);
      setNotice(
        "Identidad confirmada. Vuelve a enviar la operación original; no se reenvió automáticamente.",
      );
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {notice && (
        <p
          role="status"
          className="m-4 rounded-xl bg-emerald-50 p-4 text-emerald-900"
        >
          {notice}
        </p>
      )}
      <Modal
        open={factor !== null}
        title="Confirma tu identidad"
        description="La confirmación dura 15 minutos. No cambia tus permisos ni reenvía operaciones."
        onClose={close}
      >
        <form onSubmit={submit} className="space-y-4">
          {error && <p role="alert">{error}</p>}
          <Field label={factor === "mfa" ? "Código TOTP" : "Contraseña actual"}>
            <input
              key={factor}
              className={inputClassName}
              name={factor === "mfa" ? "code" : "password"}
              type={factor === "mfa" ? "text" : "password"}
              required
              maxLength={factor === "mfa" ? 6 : 128}
              pattern={factor === "mfa" ? "[0-9]{6}" : undefined}
              inputMode={factor === "mfa" ? "numeric" : undefined}
              autoComplete={
                factor === "mfa" ? "one-time-code" : "current-password"
              }
            />
          </Field>
          <FormActions
            saving={busy}
            submitLabel="Confirmar identidad"
            onCancel={close}
          />
        </form>
      </Modal>
    </>
  );
}
