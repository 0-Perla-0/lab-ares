"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import type { ApiEnvelope } from "@/lib/types";
import {
  Field,
  LoadError,
  LoadingTable,
  PageHeader,
  Panel,
  inputClassName,
} from "@/components/ui/primitives";

type Session = {
  id: string;
  current: boolean;
  createdAt: string;
  lastActivityAt: string;
  userAgentSummary?: string;
};
export function SecurityPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState<{
    secret: string;
    otpauthUri: string;
  } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [s, m] = await Promise.all([
      apiRequest<ApiEnvelope<Session[]>>("/api/auth/sessions"),
      apiRequest<ApiEnvelope<{ enabled: boolean }>>("/api/auth/mfa"),
    ]);
    setSessions(s.data);
    setEnabled(m.data.enabled);
  }, []);
  useEffect(() => {
    void load().catch((cause) => setError(getApiErrorMessage(cause, "load")));
  }, [load]);
  async function action(path: string, body?: object, method = "POST") {
    setBusy(true);
    setError("");
    setNotice("");
    setCodes([]);
    try {
      const result = await apiRequest<
        ApiEnvelope<{
          secret?: string;
          otpauthUri?: string;
          recoveryCodes?: string[];
        }>
      >(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (result?.data?.secret && result.data.otpauthUri)
        setSetup({
          secret: result.data.secret,
          otpauthUri: result.data.otpauthUri,
        });
      if (result?.data?.recoveryCodes) {
        setCodes(result.data.recoveryCodes);
        setSetup(null);
      }
      setNotice("Operación confirmada por el servidor.");
      await load();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function submit(
    event: FormEvent<HTMLFormElement>,
    path: string,
    passwordChange = false,
  ) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const body = passwordChange
      ? {
          currentPassword: form.get("password"),
          newPassword: form.get("newPassword"),
          ...(form.get("code") ? { code: form.get("code") } : {}),
        }
      : {
          ...Object.fromEntries(form.entries()),
          ...(form.has("recovery")
            ? { recovery: form.get("recovery") === "on" }
            : {}),
        };
    void action(path, body).finally(() => element.reset());
  }
  if (!sessions && error)
    return (
      <LoadError
        message={error}
        onRetry={() =>
          void load().catch((cause) => setError(getApiErrorMessage(cause)))
        }
      />
    );
  if (!sessions) return <LoadingTable />;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Seguridad de mi cuenta"
        description="Administra contraseña, sesiones y segundo factor opcional."
      />
      {error && (
        <p role="alert" className="text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <Panel title="Cambiar contraseña">
        <form
          className="space-y-4"
          onSubmit={(event) => submit(event, "/api/auth/password/change", true)}
        >
          <Field label="Contraseña actual">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClassName}
            />
          </Field>
          <Field
            label="Nueva contraseña"
            hint="15–128 caracteres; espacios y Unicode permitidos."
          >
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              required
              className={inputClassName}
            />
          </Field>
          {enabled && <TotpField />}
          <ActionButton busy={busy}>Cambiar contraseña</ActionButton>
        </form>
      </Panel>
      <Panel
        title="Segundo factor"
        description={
          enabled
            ? "TOTP está activado."
            : "MFA es opcional. No activarlo no reduce tus permisos."
        }
      >
        {!enabled && !setup && (
          <form
            className="space-y-4"
            onSubmit={(event) => submit(event, "/api/auth/mfa/setup")}
          >
            <PasswordField />
            <ActionButton busy={busy}>Preparar TOTP</ActionButton>
          </form>
        )}
        {setup && (
          <div className="space-y-4">
            <p>
              Introduce esta clave en tu aplicación autenticadora. No la
              compartas.
            </p>
            <code className="block break-all">{setup.secret}</code>
            <a href={setup.otpauthUri} className="focus-ring underline">
              Abrir aplicación autenticadora
            </a>
            <form
              onSubmit={(event) => submit(event, "/api/auth/mfa/enable")}
              className="space-y-4"
            >
              <TotpField />
              <ActionButton busy={busy}>Confirmar activación</ActionButton>
            </form>
            <button
              type="button"
              onClick={() => setSetup(null)}
              className="focus-ring underline"
            >
              Ocultar clave
            </button>
          </div>
        )}
        {enabled && (
          <>
            <form
              className="space-y-4"
              onSubmit={(event) =>
                submit(event, "/api/auth/mfa/recovery-codes/regenerate")
              }
            >
              <PasswordField />
              <RecoveryFactorField />
              <ActionButton busy={busy}>
                Generar nuevos códigos de recuperación
              </ActionButton>
            </form>
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  window.confirm("¿Desactivar el segundo factor de tu cuenta?")
                )
                  submit(event, "/api/auth/mfa/disable");
              }}
            >
              <PasswordField />
              <RecoveryFactorField />
              <ActionButton busy={busy}>Desactivar MFA</ActionButton>
            </form>
          </>
        )}
        {codes.length > 0 && (
          <section className="mt-6" aria-label="Códigos de recuperación">
            <p role="status">
              Guárdalos en un lugar seguro. Se muestran una sola vez y cada
              código se usa una sola vez.
            </p>
            <ul>
              {codes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
            <button
              className="focus-ring underline"
              onClick={() => setCodes([])}
            >
              Ya los guardé; ocultar
            </button>
          </section>
        )}
      </Panel>
      <Panel title="Sesiones activas">
        <ul className="space-y-4">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"
            >
              <div>
                <p>
                  {session.current
                    ? "Esta sesión"
                    : session.userAgentSummary || "Sesión de navegador"}
                </p>
                <p className="text-sm">
                  Última actividad:{" "}
                  {new Date(session.lastActivityAt).toLocaleString("es-MX")}
                </p>
              </div>
              <button
                disabled={busy}
                className="focus-ring min-h-11 underline"
                onClick={() => {
                  if (window.confirm("¿Cerrar esta sesión?"))
                    void action(
                      `/api/auth/sessions/${encodeURIComponent(session.id)}`,
                      undefined,
                      "DELETE",
                    );
                }}
              >
                Cerrar sesión
              </button>
            </li>
          ))}
        </ul>
        <button
          disabled={busy}
          className="focus-ring mt-4 min-h-11 underline"
          onClick={() => {
            if (window.confirm("¿Cerrar las demás sesiones?"))
              void action("/api/auth/sessions/others", undefined, "DELETE");
          }}
        >
          Cerrar las demás sesiones
        </button>
      </Panel>
    </div>
  );
}
function PasswordField() {
  return (
    <Field label="Confirma tu contraseña">
      <input
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className={inputClassName}
      />
    </Field>
  );
}
function TotpField() {
  return (
    <Field label="Código TOTP">
      <input
        name="code"
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        className={inputClassName}
      />
    </Field>
  );
}
function RecoveryFactorField() {
  const [recovery, setRecovery] = useState(false);
  return (
    <>
      <label className="flex min-h-11 items-center gap-2">
        <input
          name="recovery"
          type="checkbox"
          checked={recovery}
          onChange={(event) => setRecovery(event.target.checked)}
        />
        Usar un código de recuperación
      </label>
      <Field label={recovery ? "Código de recuperación" : "Código TOTP"}>
        <input
          key={String(recovery)}
          name="code"
          required
          autoComplete="one-time-code"
          pattern={recovery ? "[a-f0-9]{16}" : "[0-9]{6}"}
          maxLength={recovery ? 16 : 6}
          inputMode={recovery ? "text" : "numeric"}
          className={inputClassName}
        />
      </Field>
    </>
  );
}
function ActionButton({
  busy,
  children,
}: {
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={busy}
      className="focus-ring min-h-11 rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] px-5 text-[var(--color-on-primary)] disabled:opacity-50"
    >
      {busy ? "Procesando…" : children}
    </button>
  );
}
