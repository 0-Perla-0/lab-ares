"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import {
  Field,
  ForbiddenState,
  PageHeader,
  inputClassName,
} from "@/components/ui/primitives";
import { hasPermission, permissions } from "@/lib/permissions";
import { apiRequest } from "@/lib/api";
import {
  actionClass,
  DomainFeedback,
  DomainInput,
  ReadFeedback,
  useDomainAction,
  useDomainData,
} from "./domain-ui";
import { VisitQr, VisitScanner } from "./visit-qr";
type Visit = {
  id: string;
  nombreVisitante: string;
  institucionProcedencia: string | null;
  motivo: string;
  estado: string;
  version: number;
  validaDesde: string;
  validaHasta: string;
  code?: string;
  codeAvailable?: boolean;
};
export function VisitsPage({ control = false }: { control?: boolean }) {
  const { user } = useAuth();
  const allowed = hasPermission(
    user,
    control ? permissions.VISITS_CONTROL : permissions.VISITS_REQUEST,
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [mine, setMine] = useState(true);
  const list = useDomainData<{ items: Visit[]; nextCursor: string | null }>(
    allowed && !control
      ? `/api/visits/invitations?mine=${mine}&limit=20${cursor ? `&cursor=${cursor}` : ""}${status ? `&estado=${status}` : ""}`
      : null,
  );
  const [visit, setVisit] = useState<Visit | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const lookupSequence = useRef(0);
  useEffect(
    () => () => {
      lookupSequence.current++;
    },
    [],
  );
  const action = useDomainAction(user.id, async () => {
    if (control && code) await lookup(code);
    else await list.load();
  });
  async function lookup(value: string) {
    const sequence = ++lookupSequence.current;
    setCode(value);
    setVisit(null);
    setLookupError("");
    setLoading(true);
    try {
      const result = await apiRequest<{ data: Visit }>(
        `/api/visits/check/${encodeURIComponent(value.trim())}`,
      );
      if (!result?.data) throw new Error();
      if (sequence === lookupSequence.current) setVisit(result.data);
    } catch {
      if (sequence === lookupSequence.current)
        setLookupError(
          "Visita no disponible, fuera de alcance o módulo deshabilitado.",
        );
    } finally {
      if (sequence === lookupSequence.current) setLoading(false);
    }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    void action.send("/api/visits/invitations", {
      sedeId: Number(f.get("sedeId")),
      ...(f.get("areaId") ? { areaId: Number(f.get("areaId")) } : {}),
      nombreVisitante: f.get("name"),
      ...(f.get("institution")
        ? { institucionProcedencia: f.get("institution") }
        : {}),
      motivo: f.get("reason"),
      fechaProgramada: f.get("date"),
      validaDesde: new Date(String(f.get("from"))).toISOString(),
      validaHasta: new Date(String(f.get("until"))).toISOString(),
    });
  }
  if (!allowed) return <ForbiddenState />;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Servicios complementarios"
        title={control ? "Control de acceso de visitas" : "Visitas privadas"}
        description="Sin cuentas para visitantes. El código sólo identifica la visita; recepción debe verificar físicamente la identificación oficial."
      />
      <DomainFeedback action={action} />
      {control ? (
        <>
          <VisitScanner onCode={(value) => void lookup(value)} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(String(new FormData(e.currentTarget).get("code")));
            }}
            className="space-y-3"
          >
            <DomainInput
              name="code"
              label="Código privado de visita"
              maxLength={64}
            />
            <button
              className={actionClass}
              disabled={loading || action.disabled}
            >
              Buscar código
            </button>
          </form>
          {loading && <p role="status">Buscando…</p>}
          {lookupError && <p role="alert">{lookupError}</p>}
          {visit && (
            <article className="rounded-xl border bg-white p-5 space-y-3">
              <h2 className="font-bold">{visit.nombreVisitante}</h2>
              <p>
                {visit.institucionProcedencia} · {visit.motivo}
              </p>
              <p>
                {visit.estado} · {new Date(visit.validaDesde).toLocaleString()}{" "}
                — {new Date(visit.validaHasta).toLocaleString()}
              </p>
              {visit.estado === "EMITIDA" &&
                user.capabilities?.["VISITS.REQUEST"] !== false && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action.send(`/api/visits/${visit.id}/check-in`, {
                        version: visit.version,
                        identificacionVerificada: true,
                      });
                    }}
                  >
                    <fieldset disabled={action.disabled}>
                      <label className="flex gap-3">
                        <input type="checkbox" required /> Verifiqué físicamente
                        la identificación oficial y coincide con el visitante
                      </label>
                      <button className={actionClass}>
                        Registrar entrada verificada
                      </button>
                    </fieldset>
                  </form>
                )}
              {visit.estado === "REGISTRADA_ENTRADA" && (
                <button
                  disabled={action.disabled}
                  className={actionClass}
                  onClick={() =>
                    void action.send(`/api/visits/${visit.id}/check-out`, {
                      version: visit.version,
                    })
                  }
                >
                  Registrar salida
                </button>
              )}
            </article>
          )}
        </>
      ) : (
        <>
          {hasPermission(user, permissions.VISITS_CONTROL) && (
            <Link href="/portal/visitas/control" className="underline">
              Ir a control de acceso
            </Link>
          )}
          <details>
            <summary className={actionClass}>Crear invitación privada</summary>
            <form onSubmit={create}>
              <fieldset
                disabled={
                  action.disabled ||
                  user.capabilities?.["VISITS.REQUEST"] === false
                }
                className="grid gap-3 sm:grid-cols-2"
              >
                <DomainInput
                  name="sedeId"
                  label="ID sede"
                  type="number"
                  min={1}
                  defaultValue={user.sedeId ?? undefined}
                />
                <DomainInput
                  name="areaId"
                  label="ID área"
                  type="number"
                  min={1}
                  required={false}
                  defaultValue={user.areaId ?? undefined}
                />
                <DomainInput
                  name="name"
                  label="Nombre del visitante"
                  maxLength={150}
                />
                <DomainInput
                  name="institution"
                  label="Institución de procedencia"
                  maxLength={150}
                  required={false}
                />
                <DomainInput
                  name="reason"
                  label="Motivo de visita"
                  maxLength={500}
                />
                <DomainInput
                  name="date"
                  label="Fecha programada en México"
                  type="date"
                />
                <DomainInput
                  name="from"
                  label="Válida desde (zona local del dispositivo)"
                  type="datetime-local"
                />
                <DomainInput
                  name="until"
                  label="Válida hasta (máximo 24 horas)"
                  type="datetime-local"
                />
                <button className={actionClass}>Confirmar invitación</button>
              </fieldset>
            </form>
          </details>
          <Field label="Estado">
            <select
              value={status}
              className={inputClassName}
              onChange={(e) => {
                setStatus(e.target.value);
                setCursor(null);
              }}
            >
              <option value="">Todos</option>
              {[
                "EMITIDA",
                "REGISTRADA_ENTRADA",
                "REGISTRADA_SALIDA",
                "VENCIDA",
                "CANCELADA",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          {hasPermission(user, permissions.VISITS_MANAGE) && (
            <label>
              <input
                type="checkbox"
                checked={mine}
                onChange={(e) => {
                  setMine(e.target.checked);
                  setCursor(null);
                }}
              />{" "}
              Sólo mis invitaciones
            </label>
          )}
          <ReadFeedback
            loading={list.loading}
            error={list.error}
            retry={() => void list.load()}
          />
          {list.data && !list.data.items.length && (
            <p>No hay visitas en esta página.</p>
          )}
          <ul className="space-y-4">
            {list.data?.items.map((v) => (
              <li
                key={`${v.id}-${v.version}`}
                className="space-y-3 rounded-xl border bg-white p-5"
              >
                <h2 className="font-bold">{v.nombreVisitante}</h2>
                <p>
                  {v.estado} · {new Date(v.validaDesde).toLocaleString()} —{" "}
                  {new Date(v.validaHasta).toLocaleString()}
                </p>
                {v.code && v.estado === "EMITIDA" && (
                  <details>
                    <summary className={actionClass}>
                      Mostrar QR privado
                    </summary>
                    <VisitQr code={v.code} />
                  </details>
                )}
                {v.codeAvailable === false && v.estado === "EMITIDA" && (
                  <p>
                    Código no recuperable con las claves vigentes. Cancela y
                    emite una nueva invitación; no sustituyas la identificación
                    física.
                  </p>
                )}
                {v.estado === "EMITIDA" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action.send(`/api/visits/${v.id}/cancel`, {
                        version: v.version,
                        reason: new FormData(e.currentTarget).get("reason"),
                      });
                    }}
                  >
                    <fieldset disabled={action.disabled}>
                      <DomainInput
                        name="reason"
                        label="Motivo de cancelación"
                        maxLength={500}
                      />
                      <button className={actionClass}>
                        Cancelar invitación
                      </button>
                    </fieldset>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <button
            className={actionClass}
            onClick={() => setCursor(null)}
            disabled={!cursor || list.loading}
          >
            Primera página
          </button>
          <button
            className={actionClass}
            disabled={!list.data?.nextCursor || list.loading}
            onClick={() => setCursor(list.data!.nextCursor)}
          >
            Siguiente página
          </button>
        </>
      )}
    </div>
  );
}
