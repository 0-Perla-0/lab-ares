"use client";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { FeaturePolicies } from "./feature-policies";
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
type Job = {
  id: string;
  name: string;
  state: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  errorCode: string | null;
};
type Incident = {
  id: string;
  externalTicketRef: string;
  severity: string;
  state: string;
  ownerId: number | null;
  reason: string;
  postmortemDueAt: string | null;
};
type Alert = { id: string; state: string; code: string; severity: string };
export function OperationsConsole() {
  const { user } = useAuth();
  const allowed = hasPermission(user, permissions.OPERATIONS_READ),
    manage = hasPermission(user, permissions.OPERATIONS_MANAGE);
  const [page, setPage] = useState(1),
    [state, setState] = useState("");
  const [issuesPage, setIssuesPage] = useState(1);
  const queues = useDomainData<{
    snapshotAt: string;
    queues: {
      queue: string;
      state: string;
      depth: number;
      expiredLeases: number;
      oldestAgeSeconds: number | null;
    }[];
  }>(allowed ? "/api/operations/queues" : null);
  const issues = useDomainData<{
    items: { userId: number; fecha: string; reason: string }[];
    total: number;
  }>(
    allowed
      ? `/api/operations/absence-evaluation-issues?page=${issuesPage}&pageSize=25`
      : null,
  );
  const status = useDomainData<{
    dependencies: Record<string, string>;
    workers?: Record<string, boolean>;
    workerHealth?: Record<
      string,
      {
        lastSucceededAt: string | null;
        lastFailedAt: string | null;
        errorCode: string | null;
        stale: boolean;
        cycleLagSeconds: number | null;
      }
    >;
    absenceEvaluationIssues?: number;
    smtp?: { enabled: boolean; connectivity: string };
    openAlerts: number;
    openIncidents: number;
  }>(allowed ? "/api/operations/status" : null);
  const jobs = useDomainData<{ items: Job[]; total: number }>(
    allowed
      ? `/api/operations/jobs?page=${page}&pageSize=25${state ? `&state=${state}` : ""}`
      : null,
  );
  const alerts = useDomainData<Alert[]>(
    allowed ? `/api/operations/alerts?page=${page}&pageSize=25` : null,
  );
  const incidents = useDomainData<Incident[]>(
    allowed ? `/api/operations/incidents?page=${page}&pageSize=25` : null,
  );
  const action = useDomainAction(user.id, async () => {
    await Promise.all([
      jobs.load(),
      alerts.load(),
      incidents.load(),
      status.load(),
      issues.load(),
      queues.load(),
    ]);
  });
  if (!allowed) return <ForbiddenState />;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administración"
        title="Operaciones y observabilidad"
        description="No se muestran payloads de trabajos ni secretos. Reintentar adelanta la programación; no ejecuta ni completa manualmente un trabajo."
      />
      <DomainFeedback action={action} />
      <FeaturePolicies />
      <section aria-label="Estado de colas">
        <h2 className="font-bold">Estado de colas</h2>
        <p>
          Edad desde creación, no vencimiento ni prueba de entrega. Sin payloads
          privados.
        </p>
        <ReadFeedback
          loading={queues.loading}
          error={queues.error}
          retry={() => void queues.load()}
        />
        <ul>
          {queues.data?.queues.map((row) => (
            <li key={`${row.queue}:${row.state}`}>
              {row.queue} · {row.state}: {row.depth} · leases vencidos:{" "}
              {row.expiredLeases} · edad mayor:{" "}
              {row.oldestAgeSeconds ?? "sin datos"} s
            </li>
          ))}
        </ul>
      </section>
      <ReadFeedback
        loading={status.loading}
        error={status.error}
        retry={() => void status.load()}
      />
      {status.data && (
        <section>
          <h2 className="font-bold">Salud de componentes</h2>
          <ul>
            {Object.entries(status.data.dependencies).map(([name, value]) => (
              <li key={name}>
                {(
                  {
                    database: "MariaDB",
                    storage: "MinIO",
                    scanner: "ClamAV",
                  } as Record<string, string>
                )[name] ?? name}
                : {value}
              </li>
            ))}
          </ul>
          <p>
            SMTP / Mailpit:{" "}
            {status.data.smtp?.enabled ? "habilitado" : "deshabilitado"};
            conectividad: {status.data.smtp?.connectivity ?? "no sondeada"}.
            Este sondeo no confirma entrega de correo.
          </p>
          <h3 className="font-bold">
            Workers (configuración, no prueba de ejecución)
          </h3>
          <ul>
            {Object.entries(status.data.workers ?? {}).map(([name, value]) => (
              <li key={name}>
                {name}: {value ? "habilitado" : "deshabilitado"}
                {value && (
                  <span>
                    {" "}
                    ·{" "}
                    {status.data?.workerHealth?.[name]?.stale === false
                      ? "ciclo reciente"
                      : "sin evidencia reciente"}{" "}
                    · último éxito:{" "}
                    {status.data?.workerHealth?.[name]?.lastSucceededAt ??
                      "no observado"}
                    {status.data?.workerHealth?.[name]?.cycleLagSeconds != null
                      ? ` · demora de ciclo: ${status.data.workerHealth[name].cycleLagSeconds} s`
                      : ""}
                    {status.data?.workerHealth?.[name]?.errorCode
                      ? ` · ${status.data.workerHealth[name].errorCode}`
                      : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p>
            Evaluaciones de ausencias pendientes de revisión histórica:{" "}
            {status.data.absenceEvaluationIssues ?? "no disponible"}. No se
            generan obligaciones a partir del turno actual.
          </p>
          <p>
            Alertas abiertas {status.data.openAlerts} · Incidentes abiertos{" "}
            {status.data.openIncidents}
          </p>
        </section>
      )}
      <section aria-labelledby="absence-issues-heading">
        <h2 id="absence-issues-heading" className="font-bold">
          Revisión de historial operativo
        </h2>
        <p>
          Fechas sin historial verificable o con cambios durante el día
          requieren revisión humana. Reprocesar no reconstruye asignaciones
          desconocidas ni modifica decisiones definitivas.
        </p>
        <ReadFeedback
          loading={issues.loading}
          error={issues.error}
          retry={() => void issues.load()}
        />
        {issues.data && (
          <>
            <ul>
              {issues.data.items.map((issue) => (
                <li key={`${issue.userId}-${issue.fecha}`}>
                  Usuario #{issue.userId} · {issue.fecha.slice(0, 10)} ·{" "}
                  {issue.reason}
                </li>
              ))}
            </ul>
            {!issues.data.items.length && (
              <p>No hay incidencias en esta página.</p>
            )}
            <div className="flex gap-2">
              <button
                className={actionClass}
                disabled={issuesPage === 1}
                onClick={() => setIssuesPage((value) => value - 1)}
              >
                Página anterior de incidencias
              </button>
              <button
                className={actionClass}
                disabled={issuesPage * 25 >= issues.data.total}
                onClick={() => setIssuesPage((value) => value + 1)}
              >
                Página siguiente de incidencias
              </button>
            </div>
          </>
        )}
        {manage && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void action.send("/api/operations/absence-evaluation/reprocess", {
                date: String(data.get("date")),
                reason: String(data.get("reason")),
              });
            }}
          >
            <fieldset disabled={action.disabled} className="space-y-3">
              <legend className="font-bold">
                Programar reevaluación (últimos 31 días cerrados)
              </legend>
              <DomainInput
                name="date"
                type="date"
                label="Fecha inicial de reevaluación"
              />
              <Field label="Motivo de reevaluación">
                <input
                  name="reason"
                  required
                  minLength={10}
                  maxLength={500}
                  className={inputClassName}
                />
              </Field>
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" required />
                Confirmo que sólo se programa el worker, sin inferir historial
                ni ejecutar restauraciones.
              </label>
              <button type="submit" className={actionClass}>
                Programar reevaluación
              </button>
            </fieldset>
          </form>
        )}
      </section>
      <h2 className="font-bold">Trabajos</h2>
      <Field label="Estado del trabajo">
        <select
          value={state}
          className={inputClassName}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos</option>
          {["PENDING", "RUNNING", "RETRY_SCHEDULED", "SUCCEEDED", "FAILED"].map(
            (s) => (
              <option key={s}>{s}</option>
            ),
          )}
        </select>
      </Field>
      <ReadFeedback
        loading={jobs.loading}
        error={jobs.error}
        retry={() => void jobs.load()}
      />
      {jobs.data && !jobs.data.items.length && (
        <p>No hay trabajos en esta página.</p>
      )}
      <ul>
        {jobs.data?.items.map((job) => (
          <li
            key={job.id}
            className="space-y-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <p>
              {job.name} · {job.state} · intentos {job.attempts}/
              {job.maxAttempts} · {job.errorCode}
            </p>
            <p>
              Próximo intento: {new Date(job.nextAttemptAt).toLocaleString()}
            </p>
            {manage &&
              job.state === "RETRY_SCHEDULED" &&
              job.attempts < job.maxAttempts && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action.send(`/api/operations/jobs/${job.id}/retry`, {
                      attempts: job.attempts,
                      reason: new FormData(e.currentTarget).get("reason"),
                    });
                  }}
                >
                  <fieldset disabled={action.disabled}>
                    <DomainInput
                      name="reason"
                      label={`Motivo de reintento de ${job.name}`}
                      maxLength={500}
                    />
                    <button className={actionClass}>
                      Solicitar reintento programado
                    </button>
                  </fieldset>
                </form>
              )}
          </li>
        ))}
      </ul>
      <h2 className="font-bold">Alertas</h2>
      <ReadFeedback
        loading={alerts.loading}
        error={alerts.error}
        retry={() => void alerts.load()}
      />
      {alerts.data && !alerts.data.length && (
        <p>No hay alertas en esta página.</p>
      )}
      <ul>
        {alerts.data?.map((alert) => (
          <li key={alert.id}>
            <p>
              {alert.code} · {alert.severity} · {alert.state}
            </p>
            {manage && alert.state === "OPEN" && (
              <button
                className={actionClass}
                disabled={action.disabled}
                onClick={() =>
                  void action.send(
                    `/api/operations/alerts/${alert.id}/acknowledge`,
                    {},
                  )
                }
              >
                Reconocer alerta
              </button>
            )}
          </li>
        ))}
      </ul>
      <h2 className="font-bold">Incidentes S1–S4</h2>
      <ReadFeedback
        loading={incidents.loading}
        error={incidents.error}
        retry={() => void incidents.load()}
      />
      {incidents.data && !incidents.data.length && (
        <p>No hay incidentes en esta página.</p>
      )}
      {manage && (
        <details>
          <summary className={actionClass}>Registrar incidente</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action.send("/api/operations/incidents", {
                externalTicketRef: f.get("ticket"),
                severity: f.get("severity"),
                ownerId: Number(f.get("owner")),
                reason: f.get("reason"),
                repeatedS2: f.get("repeated") === "on",
              });
            }}
          >
            <fieldset disabled={action.disabled} className="space-y-3">
              <DomainInput
                name="ticket"
                label="Ticket externo"
                maxLength={191}
              />
              <Field label="Severidad">
                <select name="severity" className={inputClassName}>
                  {["S1", "S2", "S3", "S4"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <DomainInput
                name="owner"
                label="ID responsable"
                type="number"
                min={1}
              />
              <DomainInput
                name="reason"
                label="Motivo del incidente (sin secretos)"
                maxLength={1000}
              />
              <label>
                <input name="repeated" type="checkbox" /> S2 repetido
              </label>
              <button className={actionClass}>Confirmar incidente</button>
            </fieldset>
          </form>
        </details>
      )}
      <ul className="space-y-3">
        {incidents.data?.map((incident) => (
          <li
            key={incident.id}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <h3 className="font-bold">
              {incident.externalTicketRef} · {incident.severity} ·{" "}
              {incident.state}
            </h3>
            <p>{incident.reason}</p>
            {incident.postmortemDueAt && (
              <p>
                Postmortem antes de{" "}
                {new Date(incident.postmortemDueAt).toLocaleString()}
              </p>
            )}
            {manage && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action.send(
                    `/api/operations/incidents/${incident.id}`,
                    {
                      state: f.get("state"),
                      ownerId: Number(f.get("owner")),
                      reason: f.get("reason"),
                    },
                    "PATCH",
                  );
                }}
              >
                <fieldset disabled={action.disabled}>
                  <Field label="Nuevo estado del incidente">
                    <select name="state" className={inputClassName}>
                      {[
                        "RECONOCIDO",
                        "INVESTIGANDO",
                        "MITIGANDO",
                        "MONITOREANDO",
                        "RESUELTO",
                        "CERRADO",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <DomainInput
                    name="owner"
                    label="ID responsable de mitigación"
                    type="number"
                    min={1}
                    defaultValue={incident.ownerId ?? user.id}
                  />
                  <DomainInput
                    name="reason"
                    label="Nota de reconocimiento / mitigación"
                    maxLength={1000}
                  />
                  <button className={actionClass}>
                    Confirmar transición de incidente
                  </button>
                </fieldset>
              </form>
            )}
          </li>
        ))}
      </ul>
      <p>Página {page} (trabajos, alertas e incidentes)</p>
      <button
        className={actionClass}
        disabled={page === 1 || jobs.loading}
        onClick={() => setPage(page - 1)}
      >
        Página anterior
      </button>
      <button
        className={actionClass}
        disabled={
          jobs.loading ||
          ((!jobs.data || page * 25 >= jobs.data.total) &&
            (alerts.data?.length ?? 0) < 25 &&
            (incidents.data?.length ?? 0) < 25)
        }
        onClick={() => setPage(page + 1)}
      >
        Página siguiente
      </button>
    </div>
  );
}
