"use client";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { hasPermission, permissions } from "@/lib/permissions";
import { Field, Panel, inputClassName } from "@/components/ui/primitives";
import {
  useDomainData,
  useDomainAction,
  DomainFeedback,
  DomainInput,
  ReadFeedback,
  actionClass,
} from "./domain-ui";
const keys = [
  "VISITS",
  "VISITS.REQUEST",
  "INVENTORY",
  "INVENTORY.MOVEMENT",
  "PRINTING_3D",
  "PRINTING_3D.REQUEST",
  "GAMIFICATION",
  "GAMIFICATION.AWARD",
  "ATTENDANCE.CONTINGENCY",
  "DOCUMENTS",
  "DOCUMENTS.UPLOAD",
  "DOCUMENTS.FORMALIZE",
  "KAIROS",
  "KAIROS.ACTIVITY",
  "ABSENCES.GENERATE",
  "GAMIFICATION.KAIROS_AWARD",
];
type Policy = {
  module: string;
  version: number;
  enabled: boolean;
  sedeIds: number[];
  areaIds: number[];
  userIds: number[];
};
export function FeaturePolicies() {
  const { user, refreshUser } = useAuth();
  const manage = hasPermission(user, permissions.OPERATIONS_MANAGE);
  const data = useDomainData<Policy[]>("/api/operations/feature-policies");
  const [key, setKey] = useState(keys[0]);
  const current = data.data?.find((row) => row.module === key);
  const action = useDomainAction(user.id, async () => {
    await data.load();
    await refreshUser();
  });
  return (
    <Panel
      title="Políticas de habilitación"
      description="Intersectan módulo, función, sede, área y usuario con RBAC y las banderas de entorno. No activan un módulo apagado por configuración. Listas vacías significan sin restricción adicional; no cambies un piloto sin aprobación."
    >
      <ReadFeedback
        loading={data.loading}
        error={data.error}
        retry={() => void data.load()}
      />
      <DomainFeedback action={action} />
      {data.data && (
        <ul>
          {data.data.map((row) => (
            <li key={row.module}>
              {row.module} · versión {row.version} ·{" "}
              {row.enabled ? "habilitada" : "pausada"}
            </li>
          ))}
        </ul>
      )}
      {manage && data.data && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const ids = (name: string) =>
              String(form.get(name) ?? "")
                .split(",")
                .filter((value) => value.trim())
                .map(Number);
            void action.send(`/api/operations/feature-policies/${key}`, {
              expectedVersion: current?.version ?? 0,
              enabled: form.get("enabled") === "on",
              sedeIds: ids("sedes"),
              areaIds: ids("areas"),
              userIds: ids("users"),
              reason: form.get("reason"),
            });
          }}
        >
          <Field label="Módulo o función">
            <select
              value={key}
              onChange={(event) => setKey(event.target.value)}
              className={inputClassName}
            >
              {keys.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <fieldset
            key={`${key}:${current?.version ?? 0}`}
            disabled={action.disabled}
            className="space-y-3"
          >
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={current?.enabled ?? false}
              />
              Permitir nuevo trabajo
            </label>
            <DomainInput
              name="sedes"
              label="IDs de sedes separados por comas"
              required={false}
              defaultValue={current?.sedeIds.join(",") ?? ""}
            />
            <DomainInput
              name="areas"
              label="IDs de áreas separados por comas"
              required={false}
              defaultValue={current?.areaIds.join(",") ?? ""}
            />
            <DomainInput
              name="users"
              label="IDs de usuarios separados por comas"
              required={false}
              defaultValue={current?.userIds.join(",") ?? ""}
            />
            <DomainInput
              name="reason"
              label="Motivo y referencia de autorización"
              maxLength={500}
            />
            <button className={actionClass}>Publicar nueva versión</button>
          </fieldset>
        </form>
      )}
    </Panel>
  );
}
