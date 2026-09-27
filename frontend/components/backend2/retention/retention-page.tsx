"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArchiveRestore,
  Gavel,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import {
  EmptyState,
  ErrorBanner,
  Field,
  ForbiddenState,
  LoadError,
  LoadingTable,
  Modal,
  PageHeader,
  Panel,
  StatusBadge,
  inputClassName,
  textareaClassName,
  type StatusTone,
} from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
import {
  retentionApi,
  retentionCategories,
  type LegalHold,
  type PageResult,
  type RetentionCategory,
  type RetentionRecord,
  type RetentionRule,
  type RetentionRuleInput,
  type SuppressionBatch,
  type SuppressionRegistryEntry,
  type SuppressionRequest,
} from "@/lib/backend2/retention";
import { hasPermission, permissions } from "@/lib/permissions";

type AdminData = {
  rules: PageResult<RetentionRule>;
  records: PageResult<RetentionRecord>;
  holds: PageResult<LegalHold>;
  requests: PageResult<SuppressionRequest>;
  batches: PageResult<SuppressionBatch>;
  registry: PageResult<SuppressionRegistryEntry>;
};

const emptyRule: RetentionRuleInput = {
  categoria: "EXPORTACIONES",
  finalidad: "",
  responsable: "",
  eventoInicio: "",
  periodoActivoDias: 1,
  periodoBloqueadoDias: 0,
  accionFinal: "ELIMINAR",
  fundamento: "",
  provisional: true,
  automatica: false,
};

export function RetentionPage() {
  const { user } = useAuth();
  const canRequest = hasPermission(user, permissions.RETENTION_REQUEST);
  const canRead = hasPermission(user, permissions.RETENTION_READ);
  const canManage = hasPermission(user, permissions.RETENTION_MANAGE);
  const canExecute = hasPermission(user, permissions.RETENTION_EXECUTE);
  const [mine, setMine] = useState<SuppressionRequest[]>([]);
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [showRule, setShowRule] = useState(false);
  const [rule, setRule] = useState<RetentionRuleInput>(emptyRule);

  const load = useCallback(async () => {
    if (!canRequest && !canRead) return;
    setLoading(true);
    setError("");
    try {
      const [myRequests, adminData] = await Promise.all([
        canRequest ? retentionApi.myRequests() : Promise.resolve([]),
        canRead
          ? Promise.all([
              retentionApi.rules(),
              retentionApi.records(),
              retentionApi.holds(),
              retentionApi.requests(),
              retentionApi.batches(),
              retentionApi.registry(),
            ]).then(([rules, records, holds, requests, batches, registry]) => ({
              rules,
              records,
              holds,
              requests,
              batches,
              registry,
            }))
          : Promise.resolve(null),
      ]);
      setMine(myRequests);
      setAdmin(adminData);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }, [canRead, canRequest]);

  useEffect(() => void load(), [load]);

  async function action(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(message);
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setBusy(false);
    }
  }

  function promptReason(label: string) {
    const value = window.prompt(`${label} (mínimo 10 caracteres)`)?.trim();
    return value && value.length >= 10 ? value : null;
  }

  async function requestSuppression(event: FormEvent) {
    event.preventDefault();
    if (requestReason.trim().length < 10) {
      setError("Describe el motivo en al menos 10 caracteres.");
      return;
    }
    await action(
      () => retentionApi.requestSuppression(user.id, requestReason.trim()),
      "Solicitud recibida. No se eliminó información de forma inmediata.",
    );
    setRequestReason("");
  }

  async function createRule(event: FormEvent) {
    event.preventDefault();
    await action(
      () => retentionApi.createRule(user.id, rule),
      "Regla creada como borrador.",
    );
    setRule(emptyRule);
    setShowRule(false);
  }

  if (!canRequest && !canRead) return <ForbiddenState />;
  if (loading && !admin && !mine.length) return <LoadingTable />;
  if (error && !admin && !mine.length)
    return <LoadError message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gobierno de datos"
        title="Retención y supresión"
        description="Consulta plazos y solicitudes; las acciones destructivas siempre requieren política, autorización y ejecución separadas."
        action={
          canManage
            ? { label: "Nueva regla", onClick: () => setShowRule(true) }
            : undefined
        }
      />
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <ShieldAlert className="mt-0.5 shrink-0" />
        <p>
          <strong>No hay borrado inmediato.</strong> Una solicitud abre un
          expediente; las retenciones legales pausan cualquier lote y las
          políticas de negocio no aprobadas permanecen bloqueadas.
        </p>
      </div>
      <ErrorBanner message={error} />
      {notice && (
        <p
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"
        >
          {notice}
        </p>
      )}

      {canRequest && (
        <Panel
          title="Mi solicitud de supresión"
          description="Solicitar inicia revisión de identidad, finalidad y obligaciones; no ejecuta una eliminación."
        >
          <form onSubmit={requestSuppression} className="space-y-3">
            <Field label="Motivo" required hint="Mínimo 10 caracteres.">
              <textarea
                className={textareaClassName}
                minLength={10}
                maxLength={2000}
                required
                value={requestReason}
                onChange={(event) => setRequestReason(event.target.value)}
              />
            </Field>
            <button
              disabled={busy}
              className="focus-ring min-h-11 rounded-xl bg-[#12221b] px-5 text-sm font-black text-white"
            >
              Enviar solicitud
            </button>
          </form>
          <div className="mt-5 space-y-2">
            {mine.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-[var(--ares-border)] p-3"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-black">
                    {new Date(item.createdAt).toLocaleDateString("es-MX")}
                  </p>
                  <StatusBadge
                    label={item.estado.replaceAll("_", " ")}
                    tone={stateTone(item.estado)}
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--ares-muted)]">
                  {item.motivo}
                </p>
                {item.resolucion && (
                  <p className="mt-2 text-sm font-bold">
                    Resolución: {item.resolucion}
                  </p>
                )}
              </article>
            ))}
            {!mine.length && (
              <p className="text-sm text-[var(--ares-muted)]">
                No tienes solicitudes registradas.
              </p>
            )}
          </div>
        </Panel>
      )}

      {admin && (
        <>
          <Panel
            title={`Reglas versionadas (${admin.rules.total})`}
            description="Aprobar una nueva versión no cambia silenciosamente fechas de registros existentes."
          >
            <CardGrid>
              {admin.rules.items.map((item) => (
                <Card
                  key={item.id}
                  title={`${item.categoria} · v${item.version}`}
                  status={item.estado}
                >
                  <p>{item.finalidad}</p>
                  <p className="mt-2 text-xs text-[var(--ares-muted)]">
                    Activo {item.periodoActivoDias} d · bloqueado{" "}
                    {item.periodoBloqueadoDias} d · {item.accionFinal}
                  </p>
                  {canManage && item.estado === "BORRADOR" && (
                    <SmallAction
                      disabled={busy}
                      label="Aprobar"
                      onClick={() => {
                        const ref = window
                          .prompt(
                            "Referencia institucional de aprobación (mínimo 10 caracteres)",
                          )
                          ?.trim();
                        if (ref && ref.length >= 10)
                          void action(
                            () =>
                              retentionApi.approveRule(user.id, item.id, ref),
                            "Regla aprobada.",
                          );
                      }}
                    />
                  )}
                </Card>
              ))}
            </CardGrid>
          </Panel>

          <Panel
            title={`Registros (${admin.records.total})`}
            description="El identificador aparece para gestión autorizada; los datos bloqueados no se exponen a usuarios ordinarios."
          >
            <CardGrid>
              {admin.records.items.map((item) => (
                <Card
                  key={item.id}
                  title={`${item.resourceType} · ${item.categoria}`}
                  status={item.estado}
                >
                  <p className="break-all text-xs">{item.resourceId}</p>
                  <p className="mt-2 text-xs text-[var(--ares-muted)]">
                    Acción programada:{" "}
                    {new Date(item.actionDueAt).toLocaleString("es-MX")}
                  </p>
                  {canManage && !item.retencionesLegales.length && (
                    <SmallAction
                      label="Crear retención legal"
                      onClick={() => {
                        const motivo = promptReason("Motivo de la retención");
                        const responsable = window
                          .prompt("Responsable")
                          ?.trim();
                        const review = window
                          .prompt("Fecha de revisión (AAAA-MM-DD)")
                          ?.trim();
                        if (motivo && responsable && review)
                          void action(
                            () =>
                              retentionApi.createHold(user.id, {
                                registroId: item.id,
                                motivo,
                                responsable,
                                reviewAt: new Date(
                                  `${review}T12:00:00`,
                                ).toISOString(),
                              }),
                            "Retención legal creada.",
                          );
                      }}
                    />
                  )}
                </Card>
              ))}
            </CardGrid>
          </Panel>

          <Panel
            title={`Retenciones legales (${admin.holds.total})`}
            description="Toda retención exige responsable y revisión; liberarla requiere motivo."
          >
            <CardGrid>
              {admin.holds.items.map((item) => (
                <Card
                  key={item.id}
                  title={item.responsable}
                  status={item.estado}
                >
                  <p>{item.motivo}</p>
                  <p className="mt-2 text-xs text-[var(--ares-muted)]">
                    Revisión:{" "}
                    {new Date(item.reviewAt).toLocaleDateString("es-MX")}
                  </p>
                  {canManage && item.estado === "ACTIVA" && (
                    <SmallAction
                      label="Liberar"
                      onClick={() => {
                        const motivo = promptReason("Motivo de liberación");
                        if (motivo)
                          void action(
                            () =>
                              retentionApi.releaseHold(
                                user.id,
                                item.id,
                                motivo,
                              ),
                            "Retención liberada.",
                          );
                      }}
                    />
                  )}
                </Card>
              ))}
            </CardGrid>
          </Panel>

          <Panel
            title={`Solicitudes administrativas (${admin.requests.total})`}
            description="Clasificar y resolver no ejecuta por sí mismo un lote de supresión."
          >
            <CardGrid>
              {admin.requests.items.map((item) => (
                <Card
                  key={item.id}
                  title={item.solicitante?.codigo ?? item.id}
                  status={item.estado}
                >
                  <p>{item.motivo}</p>
                  {canManage &&
                    ["ABIERTA", "EN_REVISION"].includes(item.estado) && (
                      <div className="flex flex-wrap gap-2">
                        <SmallAction
                          label="En revisión"
                          onClick={() => {
                            const resolucion = promptReason("Nota de revisión");
                            if (resolucion)
                              void action(
                                () =>
                                  retentionApi.resolveRequest(
                                    user.id,
                                    item.id,
                                    {
                                      decision: "REVIEW",
                                      resolucion,
                                      clasificacion: [],
                                    },
                                  ),
                                "Solicitud en revisión.",
                              );
                          }}
                        />
                        <SmallAction
                          label="Resolver"
                          onClick={() => {
                            const resolucion = promptReason("Resolución");
                            const approved = window.confirm(
                              "Aceptar = aprobar. Cancelar = rechazar.",
                            );
                            const raw =
                              window.prompt(
                                "Categorías separadas por coma (opcional)",
                              ) ?? "";
                            const clasificacion = raw
                              .split(",")
                              .map((x) => x.trim())
                              .filter((x): x is RetentionCategory =>
                                retentionCategories.includes(
                                  x as RetentionCategory,
                                ),
                              );
                            if (resolucion)
                              void action(
                                () =>
                                  retentionApi.resolveRequest(
                                    user.id,
                                    item.id,
                                    {
                                      decision: approved ? "APPROVE" : "REJECT",
                                      resolucion,
                                      clasificacion,
                                    },
                                  ),
                                "Solicitud resuelta.",
                              );
                          }}
                        />
                      </div>
                    )}
                </Card>
              ))}
            </CardGrid>
          </Panel>

          <Panel
            title={`Lotes de supresión (${admin.batches.total})`}
            description="La vista previa se crea en borrador; autorización, ejecución, pausa y reintento son pasos distintos."
            action={
              canManage ? (
                <SmallAction
                  label="Crear vista previa"
                  icon={<Plus size={15} />}
                  onClick={() => {
                    const date = window.prompt("Corte (AAAA-MM-DD)")?.trim();
                    const category = window
                      .prompt("Categoría opcional")
                      ?.trim();
                    if (date)
                      void action(
                        () =>
                          retentionApi.createBatch(user.id, {
                            cutoffAt: new Date(
                              `${date}T23:59:59`,
                            ).toISOString(),
                            limit: 100,
                            ...(category &&
                            retentionCategories.includes(
                              category as RetentionCategory,
                            )
                              ? { categoria: category as RetentionCategory }
                              : {}),
                          }),
                        "Vista previa del lote creada.",
                      );
                  }}
                />
              ) : undefined
            }
          >
            <CardGrid>
              {admin.batches.items.map((item) => (
                <Card
                  key={item.id}
                  title={item.categoria ?? "Todas las categorías"}
                  status={item.estado}
                >
                  <p className="text-xs text-[var(--ares-muted)]">
                    {item.totalItems ?? item.elementos.length} elementos ·{" "}
                    {item.completedItems ?? 0} ejecutados ·{" "}
                    {item.failedItems ?? 0} fallidos
                  </p>
                  {canExecute && (
                    <div className="flex flex-wrap gap-2">
                      {item.estado === "BORRADOR" && (
                        <SmallAction
                          label="Autorizar"
                          icon={<Gavel size={15} />}
                          onClick={() =>
                            void action(
                              () =>
                                retentionApi.authorizeBatch(user.id, item.id),
                              "Lote autorizado.",
                            )
                          }
                        />
                      )}
                      {["AUTORIZADO", "PAUSADO"].includes(item.estado) && (
                        <SmallAction
                          label="Ejecutar"
                          icon={<Play size={15} />}
                          onClick={() =>
                            void action(
                              () => retentionApi.executeBatch(user.id, item.id),
                              "Ejecución solicitada.",
                            )
                          }
                        />
                      )}
                      {["AUTORIZADO", "EN_EJECUCION"].includes(item.estado) && (
                        <SmallAction
                          label="Pausar"
                          icon={<Pause size={15} />}
                          onClick={() => {
                            const motivo = promptReason("Motivo de pausa");
                            if (motivo)
                              void action(
                                () =>
                                  retentionApi.pauseBatch(
                                    user.id,
                                    item.id,
                                    motivo,
                                  ),
                                "Lote pausado.",
                              );
                          }}
                        />
                      )}
                      {item.estado === "FALLIDO" && (
                        <SmallAction
                          label="Reintentar"
                          icon={<RefreshCw size={15} />}
                          onClick={() =>
                            void action(
                              () => retentionApi.retryBatch(user.id, item.id),
                              "Reintento solicitado.",
                            )
                          }
                        />
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </CardGrid>
          </Panel>

          <Panel
            title={`Ledger de supresión (${admin.registry.total})`}
            description="Sólo conserva huellas SHA-256 y metadatos mínimos; no muestra identificadores crudos eliminados."
            action={
              canExecute ? (
                <SmallAction
                  label="Reaplicar tras restauración"
                  icon={<ArchiveRestore size={15} />}
                  onClick={() =>
                    window.confirm(
                      "¿Reaplicar el ledger antes de habilitar el entorno restaurado?",
                    ) &&
                    void action(
                      () => retentionApi.reapply(user.id),
                      "Reaplicación completada.",
                    )
                  }
                />
              ) : undefined
            }
          >
            <CardGrid>
              {admin.registry.items.map((item) => (
                <Card
                  key={item.id}
                  title={`${item.categoria} · ${item.accion}`}
                  status={`Política v${item.policyVersion}`}
                >
                  <p className="break-all font-mono text-xs">
                    {item.resourceFingerprint}
                  </p>
                  <p className="mt-2 text-xs text-[var(--ares-muted)]">
                    {new Date(item.occurredAt).toLocaleString("es-MX")}
                  </p>
                </Card>
              ))}
            </CardGrid>
          </Panel>
        </>
      )}

      <Modal
        open={showRule}
        title="Nueva regla de retención"
        description="Los valores institucionales no aprobados deben permanecer como borrador; sólo temporales seguros pueden ser provisionales automáticos."
        onClose={() => !busy && setShowRule(false)}
      >
        <form onSubmit={createRule} className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoría">
            <select
              className={inputClassName}
              value={rule.categoria}
              onChange={(e) =>
                setRule((old) => ({
                  ...old,
                  categoria: e.target.value as RetentionCategory,
                }))
              }
            >
              {retentionCategories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Acción final">
            <select
              className={inputClassName}
              value={rule.accionFinal}
              onChange={(e) =>
                setRule((old) => ({
                  ...old,
                  accionFinal: e.target.value as "ELIMINAR" | "ANONIMIZAR",
                }))
              }
            >
              <option>ELIMINAR</option>
              <option>ANONIMIZAR</option>
            </select>
          </Field>
          <Field label="Finalidad" required>
            <textarea
              className={textareaClassName}
              minLength={10}
              required
              value={rule.finalidad}
              onChange={(e) =>
                setRule((old) => ({ ...old, finalidad: e.target.value }))
              }
            />
          </Field>
          <Field label="Fundamento" required>
            <textarea
              className={textareaClassName}
              minLength={10}
              required
              value={rule.fundamento}
              onChange={(e) =>
                setRule((old) => ({ ...old, fundamento: e.target.value }))
              }
            />
          </Field>
          <Field label="Responsable" required>
            <input
              className={inputClassName}
              minLength={3}
              required
              value={rule.responsable}
              onChange={(e) =>
                setRule((old) => ({ ...old, responsable: e.target.value }))
              }
            />
          </Field>
          <Field label="Evento de inicio" required>
            <input
              className={inputClassName}
              minLength={3}
              required
              value={rule.eventoInicio}
              onChange={(e) =>
                setRule((old) => ({ ...old, eventoInicio: e.target.value }))
              }
            />
          </Field>
          <Field label="Días activos">
            <input
              className={inputClassName}
              type="number"
              min={0}
              max={36500}
              value={rule.periodoActivoDias}
              onChange={(e) =>
                setRule((old) => ({
                  ...old,
                  periodoActivoDias: Number(e.target.value),
                }))
              }
            />
          </Field>
          <Field label="Días bloqueados">
            <input
              className={inputClassName}
              type="number"
              min={0}
              max={36500}
              value={rule.periodoBloqueadoDias}
              onChange={(e) =>
                setRule((old) => ({
                  ...old,
                  periodoBloqueadoDias: Number(e.target.value),
                }))
              }
            />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={rule.provisional}
              onChange={(e) =>
                setRule((old) => ({
                  ...old,
                  provisional: e.target.checked,
                  automatica: e.target.checked ? old.automatica : false,
                }))
              }
            />{" "}
            Política provisional
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={rule.automatica}
              disabled={!rule.provisional}
              onChange={(e) =>
                setRule((old) => ({ ...old, automatica: e.target.checked }))
              }
            />{" "}
            Automatización solicitada
          </label>
          <button
            disabled={busy}
            className="focus-ring min-h-11 rounded-xl bg-[#12221b] px-5 text-sm font-black text-white sm:col-span-2"
          >
            Crear borrador
          </button>
        </form>
      </Modal>
    </div>
  );
}

function stateTone(state: string): StatusTone {
  if (/RECHAZ|FALL|SUPRIMIDO/.test(state)) return "danger";
  if (/APROBAD|COMPLET|ANONIMIZADO|LIBERADA/.test(state)) return "success";
  if (/REVISION|EJECUCION|AUTORIZADO/.test(state)) return "info";
  return "warning";
}
function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
  );
}
function Card({
  title,
  status,
  children,
}: {
  title: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-[var(--ares-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-black">{title}</h3>
        <StatusBadge
          label={status.replaceAll("_", " ")}
          tone={stateTone(status)}
        />
      </div>
      <div className="mt-3 text-sm leading-6">{children}</div>
    </article>
  );
}
function SmallAction({
  label,
  onClick,
  icon,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="focus-ring mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--ares-border-strong)] bg-white px-3 text-sm font-black disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}
