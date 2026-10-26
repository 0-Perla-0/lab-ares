"use client";
import { useState } from "react";
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
  DomainFeedback,
  DomainInput,
  ReadFeedback,
  useDomainAction,
  useDomainData,
} from "./domain-ui";
type Run = {
  id: string;
  name: string;
  state: string;
  scope: string;
  rpoTargetMinutes: number;
  rtoTargetMinutes: number;
  actualRpoMinutes: number | null;
  actualRtoMinutes: number | null;
};
export function RecoveryConsole() {
  const { user } = useAuth();
  const allowed = hasPermission(user, permissions.RECOVERY_READ),
    manage = hasPermission(user, permissions.RECOVERY_MANAGE),
    execute = hasPermission(user, permissions.RECOVERY_EXECUTE);
  const [page, setPage] = useState(1);
  const status = useDomainData<{
    barrier: {
      active: boolean;
      snapshotAt: string | null;
      runId: string | null;
    };
    run: { id: string; state: string } | null;
  }>(allowed ? "/api/recovery/status" : null);
  const runs = useDomainData<{ items: Run[]; total: number }>(
    allowed ? `/api/recovery?page=${page}&pageSize=25` : null,
  );
  const drills = useDomainData<Run[]>(allowed ? "/api/recovery/drills" : null);
  const [preview, setPreview] = useState<{
    proposed?: number;
    planHash?: string;
  } | null>(null);
  const action = useDomainAction(user.id, async () => {
    await Promise.all([runs.load(), status.load(), drills.load()]);
  });
  if (!allowed) return <ForbiddenState />;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administración"
        title="Control de recuperación"
        description="Preparación y vista previa únicamente. Esta consola no restaura bases, ejecuta borrados ni levanta la barrera de escritura."
      />
      <DomainFeedback action={action} />
      <ReadFeedback
        loading={status.loading}
        error={status.error}
        retry={() => void status.load()}
      />
      {status.data && (
        <section>
          <h2 className="font-bold">
            Barrera de escritura:{" "}
            {status.data.barrier.active ? "ACTIVA · modo lectura" : "inactiva"}
          </h2>
          <p>
            Snapshot backend:{" "}
            {status.data.barrier.snapshotAt
              ? new Date(status.data.barrier.snapshotAt).toLocaleString()
              : "no disponible"}
          </p>
          <p>
            Recuperación activa: {status.data.run?.id ?? "ninguna"} ·{" "}
            {status.data.run?.state}
          </p>
        </section>
      )}
      {manage && (
        <details>
          <summary className={actionClass}>
            Preparar simulacro / plan de recuperación
          </summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action.send("/api/recovery", {
                name: f.get("name"),
                scope: f.get("scope"),
                responsibleId: Number(f.get("responsible")),
                isDrill: f.get("drill") === "on",
              });
            }}
          >
            <fieldset disabled={action.disabled} className="space-y-3">
              <DomainInput
                name="name"
                label="Nombre del plan (sin secretos)"
                maxLength={191}
              />
              <Field label="Alcance">
                <select name="scope" className={inputClassName}>
                  <option>CRITICO</option>
                  <option>IMPORTANTE</option>
                  <option>SECUNDARIO</option>
                </select>
              </Field>
              <DomainInput
                name="responsible"
                label="ID responsable del plan"
                type="number"
                min={1}
              />
              <label>
                <input type="checkbox" name="drill" defaultChecked /> Simulacro
              </label>
              <button className={actionClass}>
                Confirmar preparación (no congela escrituras)
              </button>
            </fieldset>
          </form>
        </details>
      )}
      <ReadFeedback
        loading={runs.loading}
        error={runs.error}
        retry={() => void runs.load()}
      />
      <h2 className="font-bold">Planes y recuperaciones</h2>
      {runs.data && !runs.data.items.length && <p>No hay planes.</p>}
      <ul className="space-y-3">
        {runs.data?.items.map((run) => (
          <li
            key={run.id}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <h3 className="font-bold">
              {run.name} · {run.state} · {run.scope}
            </h3>
            <p>
              RPO real/objetivo: {run.actualRpoMinutes ?? "no medido"}/
              {run.rpoTargetMinutes} min · RTO:{" "}
              {run.actualRtoMinutes ?? "no medido"}/{run.rtoTargetMinutes} min
            </p>
            {execute &&
              ["RESTORE_RECORDED", "RECONCILIATION_PREVIEWED"].includes(
                run.state,
              ) && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const limit = Number(
                      new FormData(e.currentTarget).get("limit"),
                    );
                    void action
                      .send<{ proposed?: number; planHash?: string }>(
                        `/api/recovery/${run.id}/reconciliation/preview`,
                        { limit },
                      )
                      .then((data) => {
                        if (data)
                          setPreview({
                            proposed: data.proposed,
                            planHash: data.planHash,
                          });
                      });
                  }}
                >
                  <fieldset disabled={action.disabled}>
                    <DomainInput
                      name="limit"
                      label="Límite de vista previa (1–1000)"
                      type="number"
                      min={1}
                      defaultValue={100}
                    />
                    <label>
                      <input type="checkbox" required /> Confirmo que sólo
                      solicito la vista previa segura
                    </label>
                    <button className={actionClass}>
                      Generar vista previa de reconciliación
                    </button>
                  </fieldset>
                </form>
              )}
          </li>
        ))}
      </ul>
      {preview && (
        <section role="status">
          <h2 className="font-bold">Vista previa confirmada</h2>
          <p>
            Propuestas: {preview.proposed ?? "ver plan técnico"} · Hash del
            plan: {preview.planHash ?? "no disponible"}. No se ejecutó
            reconciliación.
          </p>
        </section>
      )}
      <button
        className={actionClass}
        disabled={page === 1 || runs.loading}
        onClick={() => setPage(page - 1)}
      >
        Anterior
      </button>
      <button
        className={actionClass}
        disabled={!runs.data || page * 25 >= runs.data.total || runs.loading}
        onClick={() => setPage(page + 1)}
      >
        Siguiente
      </button>
      <h2 className="font-bold">Historial de simulacros (últimos 100)</h2>
      <ReadFeedback
        loading={drills.loading}
        error={drills.error}
        retry={() => void drills.load()}
      />
      {drills.data && !drills.data.length && (
        <p>No hay simulacros registrados.</p>
      )}
      <ul>
        {drills.data?.map((run) => (
          <li key={run.id}>
            {run.name} · {run.state} · RPO {run.actualRpoMinutes ?? "no medido"}
            /{run.rpoTargetMinutes} min · RTO{" "}
            {run.actualRtoMinutes ?? "no medido"}/{run.rtoTargetMinutes} min
          </li>
        ))}
      </ul>
    </div>
  );
}
