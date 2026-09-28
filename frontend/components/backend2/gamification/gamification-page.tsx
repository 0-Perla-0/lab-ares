"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Award,
  Medal,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import {
  EmptyState,
  ErrorBanner,
  Field,
  FormActions,
  LoadError,
  LoadingTable,
  Modal,
  PageHeader,
  Panel,
  Pagination,
  StatusBadge,
  inputClassName,
  textareaClassName,
} from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
import {
  gamificationApi,
  isGamificationDisabled,
  type GamificationBadge,
  type GamificationEvent,
  type GamificationHistory,
  type GamificationProfile,
  type GamificationRule,
} from "@/lib/backend2/gamification";
import { hasPermission, permissions } from "@/lib/permissions";

type AdminForm = "rule" | "badge" | "recognition" | null;

export function GamificationPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, permissions.GAMIFICATION_MANAGE);
  const [profile, setProfile] = useState<GamificationProfile | null>(null);
  const [history, setHistory] = useState<GamificationHistory | null>(null);
  const [rules, setRules] = useState<GamificationRule[]>([]);
  const [badges, setBadges] = useState<GamificationBadge[]>([]);
  const [adminUserId, setAdminUserId] = useState<number | undefined>();
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<AdminForm>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setDisabled(false);
    try {
      const [nextProfile, nextHistory] = await Promise.all([
        gamificationApi.profile(adminUserId),
        gamificationApi.history(adminUserId, historyPage),
      ]);
      setProfile(nextProfile);
      setHistory(nextHistory);
      if (canManage) {
        const [nextRules, nextBadges] = await Promise.all([
          gamificationApi.rules(),
          gamificationApi.badges(),
        ]);
        setRules(nextRules);
        setBadges(nextBadges);
      }
    } catch (requestError) {
      if (isGamificationDisabled(requestError)) setDisabled(true);
      else setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }, [adminUserId, canManage, historyPage]);
  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      if (form === "rule")
        await gamificationApi.createRule({
          codigo: String(data.get("codigo")).trim().toUpperCase(),
          origen: "KAIROS_TERMINADA",
          puntos: Number(data.get("puntos")),
          motivo: String(data.get("motivo")),
        });
      if (form === "badge")
        await gamificationApi.createBadge({
          codigo: String(data.get("codigo")).trim().toUpperCase(),
          nombre: String(data.get("nombre")),
          descripcion: String(data.get("descripcion")),
          umbralPuntos: Number(data.get("umbralPuntos")),
          motivo: String(data.get("motivo")),
        });
      if (form === "recognition")
        await gamificationApi.recognize(user.id, {
          usuarioId: Number(data.get("usuarioId")),
          puntos: Number(data.get("puntos")),
          motivo: String(data.get("motivo")),
        });
      setForm(null);
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setSaving(false);
    }
  }

  async function reverse(event: GamificationEvent) {
    const motivo = window.prompt(
      "Motivo de la reversa (quedará en el historial)",
    );
    if (
      !motivo ||
      !window.confirm(
        "¿Confirmas la reversa? No se elimina el evento original.",
      )
    )
      return;
    setSaving(true);
    try {
      await gamificationApi.reverse(user.id, event.id, motivo);
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !profile) return <LoadingTable />;
  if (disabled) return <Unavailable />;
  if (error && !profile)
    return <LoadError message={error} onRetry={() => void load()} />;
  if (!profile || !history) return null;

  const progress = Math.max(
    0,
    Math.min(
      100,
      ((profile.puntos % profile.puntosPorNivel) / profile.puntosPorNivel) *
        100,
    ),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reconocimiento privado"
        title="Mi progreso"
        description="Tu experiencia, nivel e insignias son privadas. Ares no publica rankings ni compara participantes."
      />
      <ErrorBanner message={error} />
      {canManage && (
        <Panel
          title="Consulta administrativa"
          description="Consulta por ID sin exponer un ranking general."
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const id = Number(
                new FormData(event.currentTarget).get("usuarioId"),
              );
              setHistoryPage(1);
              setAdminUserId(Number.isInteger(id) && id > 0 ? id : undefined);
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <Field label="ID del usuario">
              <input
                name="usuarioId"
                type="number"
                min="1"
                defaultValue={adminUserId}
                className={inputClassName}
              />
            </Field>
            <button className="focus-ring min-h-11 rounded-xl bg-[var(--ares-ink)] px-4 text-sm font-black text-white">
              Consultar
            </button>
            {adminUserId && (
              <button
                type="button"
                onClick={() => setAdminUserId(undefined)}
                className="focus-ring min-h-11 rounded-xl border border-[var(--ares-border-strong)] px-4 text-sm font-black"
              >
                Volver a mi perfil
              </button>
            )}
          </form>
        </Panel>
      )}
      <section className="grid gap-4 md:grid-cols-3">
        <Metric
          icon={<Sparkles />}
          label="Experiencia"
          value={`${profile.puntos} XP`}
        />
        <Metric icon={<Trophy />} label="Nivel" value={String(profile.nivel)} />
        <Metric
          icon={<Medal />}
          label="Insignias"
          value={String(profile.insignias.length)}
        />
      </section>
      <Panel
        title={`Camino al nivel ${profile.nivel + 1}`}
        description={`${profile.puntos % profile.puntosPorNivel} de ${profile.puntosPorNivel} XP en este nivel`}
      >
        <div
          className="h-3 overflow-hidden rounded-full bg-[var(--ares-surface-soft)]"
          role="progressbar"
          aria-label="Progreso del nivel"
          aria-valuemin={0}
          aria-valuemax={profile.puntosPorNivel}
          aria-valuenow={profile.puntos % profile.puntosPorNivel}
        >
          <div
            className="h-full rounded-full bg-[#769a27] transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </Panel>
      <Panel
        title="Insignias obtenidas"
        description="Reconocimientos alcanzados por tu propia actividad."
      >
        {profile.insignias.length === 0 ? (
          <EmptyState
            title="Aún no hay insignias"
            description="Tus logros aparecerán aquí cuando alcances los umbrales configurados."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {profile.insignias.map((badge) => (
              <article
                key={`${badge.codigo}-${badge.version}`}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
              >
                <Award className="text-amber-700" />
                <h3 className="mt-3 font-black text-amber-950">
                  {badge.nombre}
                </h3>
                <p className="mt-1 text-sm text-amber-900">
                  {badge.descripcion}
                </p>
                <p className="mt-3 text-xs font-black text-amber-800">
                  {badge.umbralPuntos} XP
                </p>
              </article>
            ))}
          </div>
        )}
      </Panel>
      <Panel
        title="Historial"
        description="Cada ajuste conserva su motivo, origen y posible reversa."
      >
        <EventList
          events={history.items}
          canReverse={canManage}
          busy={saving}
          onReverse={reverse}
        />
        <Pagination
          page={history.page}
          pageSize={history.pageSize}
          total={history.total}
          disabled={loading}
          onPageChange={setHistoryPage}
        />
      </Panel>
      {canManage && (
        <AdminPanel rules={rules} badges={badges} onOpen={setForm} />
      )}
      <AdminFormModal
        type={form}
        saving={saving}
        onClose={() => setForm(null)}
        onSubmit={submit}
      />
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-[var(--ares-border)] bg-[var(--ares-surface)] p-5 shadow-sm">
      <div
        className="grid h-11 w-11 place-items-center rounded-xl bg-[#e9f6cb] text-[#557416]"
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="mt-4 text-sm font-bold text-[var(--ares-muted)]">{label}</p>
      <strong className="mt-1 block text-3xl font-black">{value}</strong>
    </article>
  );
}

function EventList({
  events,
  canReverse,
  busy,
  onReverse,
}: {
  events: GamificationEvent[];
  canReverse: boolean;
  busy: boolean;
  onReverse: (event: GamificationEvent) => void;
}) {
  if (!events.length)
    return (
      <EmptyState
        title="Sin movimientos"
        description="Todavía no hay experiencia registrada."
      />
    );
  const reversedIds = new Set(
    events.flatMap((event) => (event.reversaDeId ? [event.reversaDeId] : [])),
  );
  return (
    <ol className="mb-5 space-y-3">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex flex-col gap-3 rounded-xl border border-[var(--ares-border)] p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <strong
                className={
                  event.puntos >= 0 ? "text-emerald-800" : "text-red-700"
                }
              >
                {event.puntos >= 0 ? "+" : ""}
                {event.puntos} XP
              </strong>
              <StatusBadge
                label={event.tipo}
                tone={event.reversaDeId ? "warning" : "neutral"}
              />
            </div>
            <p className="mt-1 text-sm">{event.motivo}</p>
            <p className="mt-1 text-xs text-[var(--ares-muted)]">
              {new Intl.DateTimeFormat("es-MX", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(event.createdAt))}
              {event.regla
                ? ` · ${event.regla.codigo} v${event.regla.version}`
                : ""}
            </p>
          </div>
          {canReverse &&
            !event.reversaDeId &&
            !reversedIds.has(event.id) &&
            event.tipo === "RECONOCIMIENTO_MANUAL" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onReverse(event)}
                className="focus-ring min-h-11 rounded-xl border border-red-200 px-3 text-sm font-black text-red-700 disabled:opacity-45"
              >
                Revertir
              </button>
            )}
        </li>
      ))}
    </ol>
  );
}

function AdminPanel({
  rules,
  badges,
  onOpen,
}: {
  rules: GamificationRule[];
  badges: GamificationBadge[];
  onOpen: (type: AdminForm) => void;
}) {
  return (
    <Panel
      title="Administración"
      description="Versiona reglas e insignias; los reconocimientos manuales requieren motivo e idempotencia."
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpen("rule")}
          className="focus-ring min-h-11 rounded-xl bg-[var(--ares-ink)] px-4 text-sm font-black text-white"
        >
          Nueva regla
        </button>
        <button
          type="button"
          onClick={() => onOpen("badge")}
          className="focus-ring min-h-11 rounded-xl border border-[var(--ares-border-strong)] px-4 text-sm font-black"
        >
          Nueva insignia
        </button>
        <button
          type="button"
          onClick={() => onOpen("recognition")}
          className="focus-ring min-h-11 rounded-xl border border-[var(--ares-border-strong)] px-4 text-sm font-black"
        >
          Reconocimiento manual
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="font-black">Reglas ({rules.length})</h3>
          <div className="mt-3 space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="rounded-xl bg-[var(--ares-surface-soft)] p-3 text-sm"
              >
                <strong>
                  {rule.codigo} v{rule.version}
                </strong>
                <p>
                  {rule.puntos} XP · {rule.origen}
                </p>
                <p className="text-[var(--ares-muted)]">{rule.motivo}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-black">Insignias ({badges.length})</h3>
          <div className="mt-3 space-y-2">
            {badges.map((badge) => (
              <div
                key={`${badge.codigo}-${badge.version}`}
                className="rounded-xl bg-[var(--ares-surface-soft)] p-3 text-sm"
              >
                <strong>
                  {badge.nombre} · v{badge.version}
                </strong>
                <p>{badge.umbralPuntos} XP</p>
                <p className="text-[var(--ares-muted)]">{badge.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function AdminFormModal({
  type,
  saving,
  onClose,
  onSubmit,
}: {
  type: AdminForm;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const titles = {
    rule: "Nueva versión de regla",
    badge: "Nueva versión de insignia",
    recognition: "Reconocimiento manual",
  };
  return (
    <Modal
      open={type !== null}
      onClose={() => !saving && onClose()}
      title={type ? titles[type] : "Administración"}
      description="Los cambios se registran de forma versionada y auditable."
    >
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        {type === "recognition" && (
          <Field label="ID del usuario" required>
            <input
              name="usuarioId"
              type="number"
              min="1"
              required
              className={inputClassName}
            />
          </Field>
        )}
        {(type === "rule" || type === "badge") && (
          <Field
            label="Código"
            hint="Mayúsculas, números y guion bajo."
            required
          >
            <input
              name="codigo"
              pattern="[A-Z0-9_]+"
              minLength={2}
              maxLength={80}
              required
              className={inputClassName}
            />
          </Field>
        )}
        {type === "badge" && (
          <>
            <Field label="Nombre" required>
              <input
                name="nombre"
                required
                maxLength={120}
                className={inputClassName}
              />
            </Field>
            <Field label="Descripción" required>
              <textarea
                name="descripcion"
                required
                maxLength={500}
                className={textareaClassName}
              />
            </Field>
            <Field label="Umbral de XP" required>
              <input
                name="umbralPuntos"
                type="number"
                min="1"
                max="1000000"
                required
                className={inputClassName}
              />
            </Field>
          </>
        )}
        {(type === "rule" || type === "recognition") && (
          <Field label="Puntos" required>
            <input
              name="puntos"
              type="number"
              min="1"
              max="10000"
              required
              className={inputClassName}
            />
          </Field>
        )}
        <Field label="Motivo" required>
          <textarea
            name="motivo"
            required
            maxLength={1000}
            className={textareaClassName}
          />
        </Field>
        <FormActions
          saving={saving}
          submitLabel={
            type === "recognition"
              ? "Registrar reconocimiento"
              : "Crear versión"
          }
          onCancel={onClose}
        />
      </form>
    </Modal>
  );
}

function Unavailable() {
  return (
    <div className="grid min-h-[55vh] place-items-center text-center">
      <div className="max-w-lg rounded-3xl border border-amber-200 bg-amber-50 p-8">
        <ShieldCheck size={38} className="mx-auto text-amber-700" />
        <h1 className="mt-4 text-3xl font-black">Gamificación no disponible</h1>
        <p className="mt-3 text-sm leading-6 text-amber-900">
          La función está desactivada por configuración institucional. Tu
          actividad sigue operando normalmente y no se publica ningún ranking.
        </p>
      </div>
    </div>
  );
}
