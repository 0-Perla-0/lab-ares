"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, Save, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
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

type Props = { mode: "create" } | { mode: "edit"; userId: number };

const editableStates = ["ACTIVO", "PENDIENTE", "INACTIVO", "LIBERADO"] as const;
const areaScopedRoles: UserRole[] = ["COORDINADOR", "JEFE_AREA"];

export function UserEditorPage(props: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<EditorData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sedeId, setSedeId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [turnoId, setTurnoId] = useState<number | null>(null);
  const editUserId = props.mode === "edit" ? props.userId : null;

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
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (!isEdit && password.length < 12) {
      setFormError("La contraseña debe tener al menos 12 caracteres.");
      setSaving(false);
      return;
    }
    if (password && new TextEncoder().encode(password).length > 72) {
      setFormError("La contraseña excede el límite seguro de 72 bytes.");
      setSaving(false);
      return;
    }

    const payload = {
      codigo: String(form.get("codigo") ?? ""),
      email: String(form.get("email") ?? ""),
      rol: String(form.get("rol")) as UserRole,
      estado: String(form.get("estado")) as UserState,
      sedeId,
      areaId,
      turnoId,
      ...(password ? { password } : {}),
    };

    try {
      await apiRequest(isEdit ? `/api/users/${item?.id}` : "/api/users", {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      router.push("/portal/usuarios");
      router.refresh();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <Link
        href="/portal/usuarios"
        className="focus-ring inline-flex items-center gap-2 rounded-lg text-xs font-black text-[#66736d] hover:text-[#12221b]"
      >
        <ArrowLeft size={15} /> Volver a usuarios
      </Link>

      <div className="mt-6 flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#c8f169]">
          <UserRoundPlus size={22} />
        </span>
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.19em] text-[#769a27]">
            Equipo
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
            {isEdit ? `Editar ${item?.codigo}` : "Registrar usuario"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#66736d]">
            {isEdit
              ? "Actualiza identidad, acceso y ubicación dentro de la organización."
              : "Crea un acceso nuevo dentro del alcance permitido por tu rol."}
          </p>
        </div>
      </div>

      <form
        onSubmit={save}
        className="mt-8 rounded-[1.6rem] border border-[#12221b]/10 bg-white p-5 shadow-[0_8px_30px_rgba(18,34,27,0.035)] sm:p-8"
      >
        <fieldset>
          <legend className="text-base font-black">Identidad y acceso</legend>
          <p className="mt-1 text-xs text-[#7a8580]">
            Datos utilizados para identificar e iniciar sesión.
          </p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
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
            <Field
              label={isEdit ? "Nueva contraseña" : "Contraseña"}
              required={!isEdit}
              hint={
                isEdit
                  ? "Déjala vacía para conservar la actual."
                  : "Mínimo 12 caracteres y máximo 72 bytes."
              }
            >
              <input
                name="password"
                type="password"
                required={!isEdit}
                minLength={isEdit ? undefined : 12}
                maxLength={128}
                autoComplete="new-password"
                className={inputClassName}
                placeholder={
                  isEdit ? "Sin cambios" : "Contraseña temporal segura"
                }
              />
            </Field>
            <Field label="Estado" required>
              <select
                name="estado"
                required
                defaultValue={item?.estado ?? "PENDIENTE"}
                className={inputClassName}
              >
                {editableStates.map((state) => (
                  <option key={state} value={state}>
                    {stateLabels[state]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </fieldset>

        <div className="my-8 border-t border-[#12221b]/10" />

        <fieldset>
          <legend className="text-base font-black">
            Responsabilidad y ubicación
          </legend>
          <p className="mt-1 text-xs text-[#7a8580]">
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
                onChange={(event) =>
                  setTurnoId(toNullableId(event.target.value))
                }
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
        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#12221b]/10 pt-6 sm:flex-row sm:justify-end">
          <Link
            href="/portal/usuarios"
            className="focus-ring rounded-xl border border-[#12221b]/15 px-5 py-2.5 text-center text-sm font-extrabold hover:bg-[#f0f1ed]"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-[#12221b] px-5 py-2.5 text-sm font-black text-white hover:bg-[#243d32] disabled:cursor-wait disabled:opacity-65"
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
