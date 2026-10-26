"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import {
  hasPermission,
  manageableRoles,
  permissions,
  roleLabels,
} from "@/lib/permissions";
import type { ApiEnvelope } from "@/lib/types";
import {
  Field,
  ForbiddenState,
  PageHeader,
  inputClassName,
} from "@/components/ui/primitives";
type Invitation = {
  id: string;
  targetEmail: string;
  role: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
};
export function InvitationsPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user, permissions.USERS_MANAGE);
  const [items, setItems] = useState<Invitation[]>([]);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!allowed) return;
    const result =
      await apiRequest<ApiEnvelope<Invitation[]>>("/api/invitations");
    setItems(result.data);
  }, [allowed]);
  useEffect(() => {
    void load().catch((cause) => setError(getApiErrorMessage(cause, "load")));
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setLink("");
    try {
      const result = await apiRequest<ApiEnvelope<{ token: string }>>(
        "/api/invitations",
        {
          method: "POST",
          body: JSON.stringify({
            targetEmail: form.get("email"),
            role: form.get("role"),
            sedeId: user.sedeId,
            areaId: user.areaId,
            turnoId: user.turnoId,
          }),
        },
      );
      setLink(
        `${window.location.origin}/invitacion?token=${encodeURIComponent(result.data.token)}`,
      );
      await load();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (!window.confirm("¿Revocar esta invitación?")) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/invitations/${encodeURIComponent(id)}/revoke`, {
        method: "POST",
      });
      await load();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!allowed) return <ForbiddenState />;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accesos"
        title="Invitaciones"
        description="Enlaces privados, revocables y de un uso; vencen en 72 horas."
      />
      {error && <p role="alert">{error}</p>}
      <form onSubmit={create} className="space-y-4">
        <Field label="Correo del invitado">
          <input
            name="email"
            type="email"
            required
            className={inputClassName}
          />
        </Field>
        <Field label="Rol">
          <select name="role" className={inputClassName}>
            {manageableRoles(user).map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </Field>
        <p>
          Esta invitación utiliza tu sede, área y turno. Para otra adscripción
          usa el alta de usuarios.
        </p>
        <button
          disabled={busy}
          className="focus-ring min-h-11 rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] px-5 text-[var(--color-on-primary)]"
        >
          Enviar invitación
        </button>
      </form>
      {link && (
        <section aria-label="Enlace privado">
          <p role="status">
            Comparte este enlace sólo con la persona invitada. No se volverá a
            mostrar.
          </p>
          <input
            readOnly
            value={link}
            aria-label="Enlace privado de invitación"
            className={inputClassName}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            className="focus-ring min-h-11 underline"
            onClick={() => setLink("")}
          >
            Ocultar enlace
          </button>
        </section>
      )}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-[var(--radius-card)] border p-4">
            <p>
              {item.targetEmail} — {item.role}
            </p>
            <p>
              {item.usedAt
                ? "Aceptada"
                : item.revokedAt
                  ? "Revocada"
                  : new Date(item.expiresAt) <= new Date()
                    ? "Vencida"
                    : "Vigente"}
            </p>
            {!item.usedAt && !item.revokedAt && (
              <button
                disabled={busy}
                className="focus-ring min-h-11 underline"
                onClick={() => void revoke(item.id)}
              >
                Revocar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
