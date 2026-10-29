"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  DomainFeedback,
  useDomainAction,
  useDomainData,
} from "@/components/portal/domain-ui";
import {
  Field,
  LoadingLines,
  Panel,
  inputClassName,
} from "@/components/ui/primitives";
import type { Formalization } from "@/lib/backend2/documents";

export function ExpedientFormalization({ userId }: { userId: number }) {
  const { user } = useAuth();
  const { data, loading, error, load } = useDomainData<Formalization[]>(
    `/api/documents/formalizations?userId=${userId}`,
  );
  const action = useDomainAction(user.id, load);
  const [inicio, setInicio] = useState("");
  const canFormalize =
    !!user.permissions?.["documents:review"] && userId !== user.id;
  async function submit(event: FormEvent) {
    event.preventDefault();
    await action.send("/api/documents/formalizations", {
      usuarioId: userId,
      inicio,
    });
  }
  return (
    <Panel
      title="Formalización del expediente"
      description="Exige adscripción académica confirmada para la fecha de inicio. Conserva una constancia inmutable; no autoriza documentos ni abona horas automáticamente."
    >
      {loading && <LoadingLines label="Consultando formalizaciones…" />}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="focus-ring min-h-11 px-3"
          >
            Reintentar consulta
          </button>
        </p>
      )}
      <ul aria-label="Formalizaciones registradas" className="space-y-2">
        {(data ?? []).map((row) => (
          <li key={row.id} className="rounded-[var(--radius-card)] border p-3">
            <strong>{row.inicio.slice(0, 10)}</strong> ·{" "}
            {row.academicSnapshot.institucion} · {row.academicSnapshot.programa}
          </li>
        ))}
      </ul>
      {data?.length === 0 && <p>No hay formalizaciones registradas.</p>}
      {canFormalize && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <fieldset
            disabled={
              action.disabled ||
              user.capabilities?.["DOCUMENTS.FORMALIZE"] === false
            }
            className="space-y-3"
          >
            <Field label="Fecha de inicio a formalizar" required>
              <input
                type="date"
                required
                value={inicio}
                onChange={(event) => setInicio(event.target.value)}
                className={inputClassName}
              />
            </Field>
            <button
              className="focus-ring min-h-11 rounded-full border px-4"
              disabled={!inicio}
            >
              Formalizar expediente
            </button>
          </fieldset>
          <DomainFeedback action={action} />
        </form>
      )}
    </Panel>
  );
}
