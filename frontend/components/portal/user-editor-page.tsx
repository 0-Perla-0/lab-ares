"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, Save, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { AdministrativeRecovery } from "./administrative-recovery";
import {
  ErrorBanner,
  Field,
  ForbiddenState,
  LoadError,
  LoadingTable,
  inputClassName,
} from "@/components/ui/primitives";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import { stateLabels } from "@/lib/format";
import {
  canReadUsers,
  manageableRoles,
  roleLabels,
  roleRank,
} from "@/lib/permissions";
import type {
  ApiEnvelope,
  Area,
  PublicUser,
  Sede,
  Turno,
  UserRole,
  UserState,
} from "@/lib/types";

type EditorData = {
  item: PublicUser | null;
  sedes: Sede[];
  areas: Area[];
  turnos: Turno[];
};

type Props =
  | {
      mode: "create";
      presentation?: "page" | "modal";
      onCancel?: () => void;
      onSaved?: () => void | Promise<void>;
    }
  | { mode: "edit"; userId: number };

const creatableStates: UserState[] = ["INVITADA", "ACTIVA"];
const editableStates: UserState[] = [
  "INVITADA",
  "ACTIVA",
  "SUSPENDIDA",
  "DESACTIVADA",
  "BLOQUEADA",
];
const areaScopedRoles: UserRole[] = ["COORDINADOR", "JEFE_AREA"];

export function UserEditorPage(props: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<EditorData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [invitationLink, setInvitationLink] = useState("");
  const [sedeId, setSedeId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [turnoId, setTurnoId] = useState<number | null>(null);
  const editUserId = props.mode === "edit" ? props.userId : null;
  const isModal = props.mode === "create" && props.presentation === "modal";

  const load = useCallback(async () => {
    if (!canReadUsers(user)) return;
    setLoadError("");
    try {
      const [sedesResponse, areasResponse, turnosResponse, userResponse] =
        await Promise.all([
          apiRequest<ApiEnvelope<Sede[]>>("/api/organization/sedes"),
          apiRequest<ApiEnvelope<Area[]>>("/api/organization/areas"),
          apiRequest<ApiEnvelope<Turno[]>>("/api/organization/turnos"),
          editUserId !== null
            ? apiRequest<ApiEnvelope<PublicUser>>(`/api/users/${editUserId}`)
            : Promise.resolve(null),
        ]);
      const item = userResponse?.data ?? null;
      const defaultSede =
        item?.sedeId ?? defaultSedeId(user, sedesResponse.data);
      const defaultArea = item?.areaId ?? defaultAreaId(user, defaultSede);
      setSedeId(defaultSede);
      setAreaId(defaultArea);
      setTurnoId(item?.turnoId ?? null);
      setData({
        item,
        sedes: sedesResponse.data,
        areas: areasResponse.data,
        turnos: turnosResponse.data,
      });
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "load"));
    }
  }, [editUserId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableSedes = useMemo(() => {
    if (!data) return [];
    if (user.rol === "ADMIN" || user.rol === "JEFE_COORDINADORES") {
      return data.sedes;
    }
    return data.sedes.filter((sede) => sede.id === user.sedeId);
  }, [data, user]);

  const availableAreas = useMemo(() => {
    if (!data || sedeId === null) return [];
    return data.areas.filter(
      (area) =>
        area.sedeId === sedeId &&
        (!areaScopedRoles.includes(user.rol) || area.id === user.areaId),
    );
  }, [data, sedeId, user]);

  const availableTurnos = useMemo(
    () =>
      !data || areaId === null
        ? []
        : data.turnos.filter((turno) => turno.areaId === areaId),
    [areaId, data],
  );

  if (!canReadUsers(user)) return <ForbiddenState />;
  if (loadError)
    return <LoadError message={loadError} onRetry={() => void load()} />;
  if (!data) return <LoadingTable />;
  if (data.item && roleRank[data.item.rol] > roleRank[user.rol]) {
    return <ForbiddenState />;
  }

  const isEdit = props.mode === "edit";
  const item = data.item;
  const scopedSede = user.rol !== "ADMIN" && user.rol !== "JEFE_COORDINADORES";
  const scopedArea = areaScopedRoles.includes(user.rol);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || invitationLink) return;
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);

    const payload = {
      codigo: String(form.get("codigo") ?? ""),
      email: String(form.get("email") ?? ""),
      rol: String(form.get("rol")) as UserRole,
      estado: String(form.get("estado")) as UserState,
      sedeId,
      areaId,
      turnoId,
    };

    try {
      const result = await apiRequest<ApiEnvelope<{ token?: string }>>(
        isEdit ? `/api/users/${item?.id}` : "/api/invitations",
        {
          method: isEdit ? "PUT" : "POST",
          body: JSON.stringify(
            isEdit
              ? payload
              : {
                  targetEmail: payload.email,
                  role: payload.rol,
                  sedeId,
                  areaId,
                  turnoId,
                },
          ),
        },
      );
      if (!isEdit && result.data.token) {
        setInvitationLink(
          `${window.location.origin}/invitacion?token=${encodeURIComponent(result.data.token)}`,
        );
        return;
      }
      if (isModal && props.mode === "create") {
        await props.onSaved?.();
      } else {
        router.push("/portal/usuarios");
        router.refresh();
      }
    } catch (error) {
      setFormError(getApiErrorMessage(error, "save"));
    } finally {
      setSaving(false);
    }
  }

  const form = (
    <form
      onSubmit={save}
      className={
        isModal
          ? ""
          : "mt-8 rounded-[var(--radius-card-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-8"
      }
    >
      {invitationLink && (
        <section
          aria-label="Invitación creada"
          className="mb-6 space-y-3 rounded-[var(--radius-card)] border p-4"
        >
          <p role="status">
            Invitación creada. Comparte el enlace privado sólo con la persona
            invitada.
          </p>
          <input
            readOnly
            value={invitationLink}
            aria-label="Enlace privado de invitación"
            className={inputClassName}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            className="focus-ring min-h-11 underline"
            onClick={() => {
              setInvitationLink("");
              if (isModal && props.mode === "create") void props.onSaved?.();
              else router.push("/portal/invitaciones");
            }}
          >
            Listo, ocultar y cerrar
          </button>
        </section>
      )}
      <fieldset>
        <legend className="text-base font-bold">Identidad y acceso</legend>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Datos utilizados para identificar e iniciar sesión.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {isEdit && (
            <Field label="Código" required>
              <input
                name="codigo"
                required
                maxLength={50}
                defaultValue={item?.codigo ?? ""}
                className={inputClassName}
                placeholder="Ej. INV-001"
              />
            </Field>
          )}
          <Field label="Correo electrónico" required>
            <input
              name="email"
              type="email"
              required
              maxLength={191}
              defaultValue={item?.email ?? ""}
              className={inputClassName}
              placeholder="persona@ejemplo.com"
            />
          </Field>
          <p className="text-sm">
            {isEdit
              ? "Las contraseñas se cambian mediante recuperación de acceso."
              : "Se enviará una invitación privada. El invitado elegirá su código y contraseña; no se crean contraseñas temporales."}
          </p>
          {isEdit && (
            <Field label="Estado" required>
              <select
                name="estado"
                required
                defaultValue={item?.estado ?? "INVITADA"}
                className={inputClassName}
              >
                {(isEdit ? editableStates : creatableStates).map((state) => (
                  <option key={state} value={state}>
                    {stateLabels[state]}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </fieldset>

      <div className="my-8 border-t border-[var(--color-border)]" />

      <fieldset>
        <legend className="text-base font-bold">
          Responsabilidad y ubicación
        </legend>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          La jerarquía limita los roles y asignaciones que puedes administrar.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Rol" required>
            <select
              name="rol"
              required
              defaultValue={item?.rol ?? "PRESTADOR"}
              className={inputClassName}
            >
              {manageableRoles(user).map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sede" required={scopedSede}>
            <select
              value={sedeId ?? ""}
              onChange={(event) => {
                const value = toNullableId(event.target.value);
                setSedeId(value);
                setAreaId(null);
                setTurnoId(null);
              }}
              disabled={scopedSede}
              className={inputClassName}
            >
              {!scopedSede && <option value="">Sin sede</option>}
              {availableSedes.map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {sede.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Área" required={scopedArea}>
            <select
              value={areaId ?? ""}
              onChange={(event) => {
                setAreaId(toNullableId(event.target.value));
                setTurnoId(null);
              }}
              disabled={sedeId === null || scopedArea}
              className={inputClassName}
            >
              {!scopedArea && <option value="">Sin área</option>}
              {availableAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Turno">
            <select
              value={turnoId ?? ""}
              onChange={(event) => setTurnoId(toNullableId(event.target.value))}
              disabled={areaId === null}
              className={inputClassName}
            >
              <option value="">Sin turno</option>
              {availableTurnos.map((turno) => (
                <option key={turno.id} value={turno.id}>
                  {turno.nombre} · {turno.horaInicio}–{turno.horaFin}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>

      <div className="mt-7">
        <ErrorBanner message={formError} />
      </div>
      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[var(--color-border)] pt-6 sm:flex-row sm:justify-end">
        {isModal && props.mode === "create" ? (
          <button
            type="button"
            onClick={props.onCancel}
            disabled={saving}
            className="focus-ring rounded-full border border-[var(--color-border)] px-5 py-2.5 text-center text-sm font-bold hover:bg-[var(--color-surface-inset)] disabled:opacity-50"
          >
            Cancelar
          </button>
        ) : (
          <Link
            href="/portal/usuarios"
            className="focus-ring rounded-full border border-[var(--color-border)] px-5 py-2.5 text-center text-sm font-bold hover:bg-[var(--color-surface-inset)]"
          >
            Cancelar
          </Link>
        )}
        <button
          type="submit"
          disabled={saving || !!invitationLink}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)] disabled:cursor-wait disabled:opacity-65"
        >
          {saving ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {saving
            ? "Guardando…"
            : isEdit
              ? "Guardar cambios"
              : "Registrar usuario"}
        </button>
      </div>
    </form>
  );

  if (isModal) return form;

  return (
    <div className="animate-fade-up">
      <Link
        href="/portal/usuarios"
        className="focus-ring inline-flex items-center gap-2 rounded-lg text-xs font-bold text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft size={15} /> Volver a usuarios
      </Link>

      <div className="mt-6 flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--color-primary)]">
          <UserRoundPlus size={22} />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-accent-text)]">
            Equipo
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
            {isEdit ? `Editar ${item?.codigo}` : "Registrar usuario"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            {isEdit
              ? "Actualiza identidad, acceso y ubicación dentro de la organización."
              : "Crea un acceso nuevo dentro del alcance permitido por tu rol."}
          </p>
        </div>
      </div>

      {form}
      {isEdit && item?.estado === "ACTIVA" && (
        <AdministrativeRecovery userId={item.id} />
      )}
    </div>
  );
}

function defaultSedeId(
  user: { rol: UserRole; sedeId: number | null },
  sedes: Sede[],
) {
  if (user.rol === "ADMIN" || user.rol === "JEFE_COORDINADORES") return null;
  return sedes.some((sede) => sede.id === user.sedeId) ? user.sedeId : null;
}

function defaultAreaId(
  user: { rol: UserRole; areaId: number | null },
  sedeId: number | null,
) {
  return areaScopedRoles.includes(user.rol) && sedeId !== null
    ? user.areaId
    : null;
}

function toNullableId(value: string) {
  return value === "" ? null : Number(value);
}
