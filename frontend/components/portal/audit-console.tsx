"use client";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  Field,
  ForbiddenState,
  PageHeader,
  inputClassName,
} from "@/components/ui/primitives";
import { hasPermission, permissions } from "@/lib/permissions";
import {
  actionClass,
  DomainInput,
  ReadFeedback,
  useDomainData,
} from "./domain-ui";
type AuditEvent = {
  id: string;
  occurredAt: string;
  actorId: number | null;
  module: string;
  action: string;
  result: string;
  correlationId: string;
};
export function AuditConsole() {
  const { user } = useAuth();
  const allowed = hasPermission(user, permissions.AUDIT_READ);
  const [page, setPage] = useState(1),
    [filters, setFilters] = useState("");
  const [period, setPeriod] = useState<string | null>(null);
  const events = useDomainData<{ items: AuditEvent[]; total: number }>(
    allowed ? `/api/audit/events?page=${page}&pageSize=25${filters}` : null,
  );
  const verification = useDomainData<{
    valid: boolean;
    issues: string[];
    eventCount?: number;
    assurance?: string;
  }>(
    period && hasPermission(user, permissions.AUDIT_EXPORT, "global")
      ? `/api/audit/manifests/${period}/verify`
      : null,
  );
  function filter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const p = new URLSearchParams();
    for (const [key, value] of f)
      if (value)
        p.set(
          key,
          ["from", "to"].includes(key)
            ? new Date(String(value)).toISOString()
            : String(value),
        );
    setFilters(`&${p}`);
    setPage(1);
  }
  if (!allowed) return <ForbiddenState />;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administración"
        title="Auditoría"
        description="Explorador con alcance backend. Integridad SHA-256 no equivale a firma legal."
      />
      <form onSubmit={filter} className="grid gap-3 sm:grid-cols-3">
        <DomainInput
          name="from"
          label="Desde"
          type="datetime-local"
          required={false}
        />
        <DomainInput
          name="to"
          label="Hasta"
          type="datetime-local"
          required={false}
        />
        <DomainInput
          name="actorId"
          label="ID actor"
          type="number"
          min={1}
          required={false}
        />
        <DomainInput
          name="module"
          label="Módulo"
          required={false}
          maxLength={60}
        />
        <DomainInput
          name="action"
          label="Acción"
          required={false}
          maxLength={100}
        />
        <DomainInput
          name="correlationId"
          label="Correlación"
          required={false}
          maxLength={100}
        />
        <Field label="Resultado">
          <select name="result" className={inputClassName}>
            <option value="">Todos</option>
            <option>SUCCESS</option>
            <option>DENIED</option>
            <option>FAILED</option>
          </select>
        </Field>
        <button className={actionClass}>Aplicar filtros de auditoría</button>
      </form>
      <ReadFeedback
        loading={events.loading}
        error={events.error}
        retry={() => void events.load()}
      />
      {events.data && !events.data.items.length && (
        <p>No hay eventos con estos filtros.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <caption className="text-left font-bold">
            Eventos de auditoría
          </caption>
          <thead>
            <tr>
              {[
                "Fecha",
                "Actor",
                "Módulo",
                "Acción",
                "Resultado",
                "Correlación",
              ].map((s) => (
                <th key={s} scope="col" className="p-2">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.data?.items.map((event) => (
              <tr key={event.id}>
                {[
                  new Date(event.occurredAt).toLocaleString(),
                  event.actorId ?? "Sistema",
                  event.module,
                  event.action,
                  event.result,
                  event.correlationId,
                ].map((v, i) => (
                  <td key={i} className="p-2">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Página {page} · {events.data?.total ?? 0} eventos
      </p>
      <button
        className={actionClass}
        disabled={page === 1 || events.loading}
        onClick={() => setPage(page - 1)}
      >
        Anterior
      </button>
      <button
        className={actionClass}
        disabled={
          !events.data || page * 25 >= events.data.total || events.loading
        }
        onClick={() => setPage(page + 1)}
      >
        Siguiente
      </button>
      {hasPermission(user, permissions.AUDIT_EXPORT, "global") && (
        <section className="space-y-3">
          <h2 className="font-bold">Verificar cadena y manifiesto diario</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPeriod(String(new FormData(e.currentTarget).get("period")));
            }}
          >
            <DomainInput
              name="period"
              label="Día UTC del manifiesto"
              type="date"
            />
            <button className={actionClass}>Verificar integridad</button>
          </form>
          <ReadFeedback
            loading={verification.loading}
            error={verification.error}
            retry={() => void verification.load()}
          />
          {verification.data && (
            <div role="status">
              <p>
                {verification.data.valid
                  ? "Integridad verificada"
                  : "Integridad NO verificada"}
              </p>
              <ul>
                {verification.data.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
