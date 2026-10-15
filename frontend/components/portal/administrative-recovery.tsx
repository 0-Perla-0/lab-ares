"use client";
import { useAuth } from "@/components/auth/auth-provider";
import { hasPermission, permissions } from "@/lib/permissions";
import { Panel } from "@/components/ui/primitives";
import {
  DomainInput,
  DomainFeedback,
  actionClass,
  useDomainAction,
} from "./domain-ui";

export function AdministrativeRecovery({ userId }: { userId: number }) {
  const { user } = useAuth();
  const action = useDomainAction(user.id, () => undefined);
  if (user.id === userId || !hasPermission(user, permissions.USERS_MANAGE))
    return null;
  return (
    <Panel
      title="Recuperación administrativa"
      description="Verifica identidad mediante el procedimiento institucional. Nunca asignes una contraseña; el servidor enviará un enlace privado y revocará las sesiones."
    >
      <DomainFeedback action={action} />
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void action.send(`/api/users/${userId}/recovery`, {
            identityVerified: form.get("identityVerified") === "on",
            ticket: form.get("ticket"),
            reason: form.get("reason"),
            ...(form.get("email") ? { email: form.get("email") } : {}),
            resetMfa: form.get("resetMfa") === "on",
          });
        }}
      >
        <fieldset disabled={action.disabled} className="space-y-3">
          <DomainInput
            name="ticket"
            label="Referencia de verificación institucional"
            maxLength={100}
          />
          <DomainInput
            name="reason"
            label="Motivo de recuperación"
            maxLength={500}
          />
          <DomainInput
            name="email"
            label="Nuevo correo verificado (opcional)"
            type="email"
            required={false}
            maxLength={191}
          />
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="identityVerified" required />
            Verifiqué la identidad según el procedimiento institucional
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="resetMfa" />
            Revocar también MFA perdido
          </label>
          <button className={actionClass}>
            Solicitar recuperación y revocar sesiones
          </button>
        </fieldset>
      </form>
    </Panel>
  );
}
