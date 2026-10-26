"use client";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  DomainFeedback,
  ReadFeedback,
  useDomainAction,
  useDomainData,
  actionClass,
} from "@/components/portal/domain-ui";
import {
  Field,
  Panel,
  inputClassName,
  textareaClassName,
} from "@/components/ui/primitives";
import type { Formalization } from "@/lib/backend2/documents";

export type ServicePeriod = {
  id: string;
  inicio: string;
  fin: string;
  estado: "REGISTRADO" | "INICIADO" | "CERRADO" | "CANCELADO";
  version: number;
  eventos: {
    id: string;
    estado: string;
    version: number;
    motivo: string;
    occurredAt: string;
  }[];
};
export function ServicePeriods({ userId }: { userId: number }) {
  const { user } = useAuth();
  const periods = useDomainData<{ items: ServicePeriod[]; total: number }>(
    `/api/service-periods?userId=${userId}&pageSize=20`,
  );
  const formalizations = useDomainData<Formalization[]>(
    `/api/documents/formalizations?userId=${userId}`,
  );
  const action = useDomainAction(user.id, periods.load);
  const [formalizacionId, setFormalization] = useState("");
  const [fin, setFin] = useState("");
  const [motivo, setReason] = useState("");
  const [selection, setSelection] = useState<{
    row: ServicePeriod;
    estado: "INICIADO" | "CERRADO" | "CANCELADO";
  } | null>(null);
  const manage = !!user.permissions?.["documents:review"] && user.id !== userId;
  const paused = user.capabilities?.["DOCUMENTS.PERIOD"] === false;
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = selection
      ? await action.send(
          `/api/service-periods/${selection.row.id}/transition`,
          {
            expectedVersion: selection.row.version,
            estado: selection.estado,
            motivo,
          },
        )
      : await action.send("/api/service-periods", {
          formalizacionId,
          fin,
          motivo,
        });
    if (result) {
      setSelection(null);
      setReason("");
    }
  }
  return (
    <Panel
      title="Periodos operativos de servicio"
      description="Fechas vinculadas a una formalización. El cierre es administrativo: no libera Servicio Social, fija metas ni abona horas."
    >
      <ReadFeedback
        loading={periods.loading}
        error={periods.error}
        retry={() => void periods.load()}
      />
      <ul aria-label="Periodos registrados" className="space-y-3">
        {(periods.data?.items ?? []).map((row) => (
          <li key={row.id} className="rounded-[var(--radius-card)] border p-3">
            <p>
              {row.inicio.slice(0, 10)} – {row.fin.slice(0, 10)} ·{" "}
              <strong>{row.estado}</strong> · versión {row.version}
            </p>
            <details>
              <summary className="focus-ring min-h-11 cursor-pointer py-2">
                Historial del periodo
              </summary>
              <ol>
                {row.eventos.map((event) => (
                  <li key={event.id}>
                    {event.estado} · {event.occurredAt} · {event.motivo}
                  </li>
                ))}
              </ol>
            </details>
            {manage && !["CERRADO", "CANCELADO"].includes(row.estado) && (
              <div className="flex flex-wrap gap-2">
                {row.estado === "REGISTRADO" && (
                  <button
                    type="button"
                    disabled={action.disabled || paused}
                    className={actionClass}
                    onClick={() => setSelection({ row, estado: "INICIADO" })}
                  >
                    Preparar inicio
                  </button>
                )}
                {row.estado === "INICIADO" && (
                  <button
                    type="button"
                    disabled={action.disabled}
                    className={actionClass}
                    onClick={() => setSelection({ row, estado: "CERRADO" })}
                  >
                    Preparar cierre administrativo
                  </button>
                )}
                <button
                  type="button"
                  disabled={action.disabled}
                  className={actionClass}
                  onClick={() => setSelection({ row, estado: "CANCELADO" })}
                >
                  Preparar cancelación
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {periods.data?.total === 0 && <p>No hay periodos registrados.</p>}
      {(periods.data?.total ?? 0) > 20 && (
        <p>
          Se muestran los 20 periodos más recientes; la API permite consultar
          las páginas restantes.
        </p>
      )}
      {manage && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <fieldset
            disabled={action.disabled || (!selection && paused)}
            className="space-y-3"
          >
            {selection ? (
              <p>
                Confirmar {selection.estado} para el periodo{" "}
                {selection.row.inicio.slice(0, 10)}. No se reenviará
                automáticamente tras reautenticación.
              </p>
            ) : (
              <>
                <ReadFeedback
                  loading={formalizations.loading}
                  error={formalizations.error}
                  retry={() => void formalizations.load()}
                />
                <button
                  type="button"
                  className={actionClass}
                  onClick={() => void formalizations.load()}
                >
                  Actualizar formalizaciones
                </button>
                <Field label="Formalización de inicio" required>
                  <select
                    required
                    value={formalizacionId}
                    onChange={(e) => setFormalization(e.target.value)}
                    className={inputClassName}
                  >
                    <option value="">Selecciona una formalización</option>
                    {(formalizations.data ?? []).map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.inicio.slice(0, 10)} ·{" "}
                        {row.academicSnapshot.programa}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Fecha final del periodo" required>
                  <input
                    type="date"
                    required
                    value={fin}
                    onChange={(e) => setFin(e.target.value)}
                    className={inputClassName}
                  />
                </Field>
              </>
            )}
            <Field label="Motivo administrativo (sin datos sensibles)" required>
              <textarea
                required
                minLength={10}
                maxLength={500}
                value={motivo}
                onChange={(e) => setReason(e.target.value)}
                className={textareaClassName}
              />
            </Field>
            <button className={actionClass}>
              {selection
                ? "Confirmar transición"
                : "Registrar periodo operativo"}
            </button>
            {selection && (
              <button
                type="button"
                className={actionClass}
                onClick={() => setSelection(null)}
              >
                Volver al registro
              </button>
            )}
          </fieldset>
          <DomainFeedback action={action} />
        </form>
      )}
    </Panel>
  );
}
