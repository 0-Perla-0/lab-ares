"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Pencil, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { durableRequest } from "@/lib/backend2/durable-request";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  FormActions,
  LoadError,
  LoadingTable,
  Modal,
  PageHeader,
  inputClassName,
} from "@/components/ui/primitives";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import { dayLabels } from "@/lib/format";
import { canManageOrganization, canManageSede } from "@/lib/permissions";
import type { ApiEnvelope, Area, Sede, Turno, WeekDay } from "@/lib/types";
import { weekDays } from "@/lib/types";

type Editor = { mode: "create" } | { mode: "edit"; item: Turno };

export function TurnosPage() {
  const { user } = useAuth();
  const [turnos, setTurnos] = useState<Turno[] | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Turno | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [turnosResponse, areasResponse, sedesResponse] = await Promise.all([
        apiRequest<ApiEnvelope<Turno[]>>("/api/organization/turnos"),
        apiRequest<ApiEnvelope<Area[]>>("/api/organization/areas"),
        apiRequest<ApiEnvelope<Sede[]>>("/api/organization/sedes"),
      ]);
      setTurnos(turnosResponse.data);
      setAreas(areasResponse.data);
      setSedes(sedesResponse.data);
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "load"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const manageableAreas = useMemo(
    () => areas.filter((area) => canManageSede(user, area.sedeId)),
    [areas, user],
  );

  const areaById = (id: number) => areas.find((area) => area.id === id);
  const sedeById = (id: number) => sedes.find((sede) => sede.id === id);
  const areaLabel = (areaId: number) => {
    const area = areaById(areaId);
    const sede = area ? sedeById(area.sedeId) : undefined;
    return area
      ? `${area.nombre} · ${sede?.nombre ?? "Sede"}`
      : `Área ${areaId}`;
  };

  function openEditor(value: Editor) {
    setFormError("");
    setSuccess("");
    setEditor(value);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setFormError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    const horaInicio = String(data.get("horaInicio") ?? "");
    const horaFin = String(data.get("horaFin") ?? "");
    if (horaInicio === horaFin) {
      setFormError("La entrada y la salida deben tener horas distintas.");
      setSaving(false);
      return;
    }

    const payload = {
      nombre: String(data.get("nombre") ?? ""),
      areaId: Number(data.get("areaId")),
      horaInicio,
      horaFin,
      dias: data.getAll("dias") as WeekDay[],
    };

    if (payload.dias.length === 0) {
      setFormError("Selecciona al menos un día de la semana.");
      setSaving(false);
      return;
    }

    try {
      const isEdit = editor.mode === "edit";
      await durableRequest(
        user.id,
        isEdit ? "org-turno-update" : "org-turno-create",
        isEdit ? String(editor.item.id) : `${payload.areaId}:${payload.nombre}`,
        isEdit
          ? `/api/organization/turnos/${editor.item.id}`
          : "/api/organization/turnos",
        isEdit ? "PUT" : "POST",
        payload,
      );
      setEditor(null);
      setSuccess(
        isEdit
          ? "El turno se actualizó correctamente."
          : "El turno fue creado correctamente.",
      );
      await load();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "save"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    setSuccess("");
    try {
      await durableRequest(
        user.id,
        "org-turno-deactivate",
        String(deleteTarget.id),
        `/api/organization/turnos/${deleteTarget.id}`,
        "DELETE",
      );
      setDeleteTarget(null);
      setSuccess("El turno quedó inactivo.");
      await load();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "delete"));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const canCreate = canManageOrganization(user) && manageableAreas.length > 0;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Organización"
        title="Turnos"
        description="Consulta horarios y días activos por área. Las altas y cambios se limitan a la estructura que administras."
        action={
          canCreate
            ? {
                label: "Nuevo turno",
                onClick: () => openEditor({ mode: "create" }),
              }
            : undefined
        }
      />

      {success && (
        <div className="mt-6 rounded-full border border-[var(--color-success-border)] bg-[var(--color-success-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-success-text)]">
          {success}
        </div>
      )}
      {!editor && formError && (
        <div className="mt-6">
          <ErrorBanner message={formError} />
        </div>
      )}

      <section className="mt-7">
        {loadError ? (
          <LoadError message={loadError} onRetry={() => void load()} />
        ) : !turnos ? (
          <LoadingTable />
        ) : turnos.length === 0 ? (
          <EmptyState
            title="Aún no hay turnos"
            description="Los horarios registrados aparecerán en esta sección."
          />
        ) : (
          <div className="table-scroll overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <table className="w-full min-w-[840px] text-left">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-inset)] text-xs font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-muted)]">
                <tr>
                  <th className="px-5 py-4">Turno</th>
                  <th className="px-5 py-4">Área y sede</th>
                  <th className="px-5 py-4">Horario</th>
                  <th className="px-5 py-4">Días</th>
                  {canManageOrganization(user) && (
                    <th className="px-5 py-4 text-right">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {turnos.map((item) => {
                  const area = areaById(item.areaId);
                  const manageable = area
                    ? canManageSede(user, area.sedeId)
                    : false;
                  return (
                    <tr
                      key={item.id}
                      className="transition hover:bg-[var(--color-surface-inset)]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--color-surface-inset)] text-[var(--color-muted)]">
                            <Clock3 size={18} />
                          </span>
                          <div>
                            <p className="text-sm font-bold">{item.nombre}</p>
                            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                              ID {item.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-[var(--color-muted)]">
                        {areaLabel(item.areaId)}
                      </td>
                      <td className="px-5 py-4 text-sm font-bold tabular-nums">
                        {item.horaInicio} – {item.horaFin}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {item.dias.map((day) => (
                            <span
                              key={day}
                              className="rounded-md bg-[var(--color-surface-inset)] px-2 py-1 text-xs font-bold text-[var(--color-muted)]"
                            >
                              {dayLabels[day]}
                            </span>
                          ))}
                        </div>
                      </td>
                      {canManageOrganization(user) && (
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={!manageable}
                              onClick={() => openEditor({ mode: "edit", item })}
                              className="focus-ring rounded-lg p-2 text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent-text)] disabled:cursor-not-allowed disabled:opacity-25"
                              aria-label={`Editar ${item.nombre}`}
                            >
                              <Pencil size={17} />
                            </button>
                            <button
                              type="button"
                              disabled={!manageable}
                              onClick={() => setDeleteTarget(item)}
                              className="focus-ring rounded-lg p-2 text-[var(--color-muted)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-25"
                              aria-label={`Dar de baja ${item.nombre}`}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={editor !== null}
        onClose={() => !saving && setEditor(null)}
        title={editor?.mode === "edit" ? "Editar turno" : "Registrar turno"}
        description="El horario utiliza formato de 24 horas y requiere al menos un día. Si la salida es anterior a la entrada, termina al día siguiente."
      >
        {editor && (
          <form onSubmit={save}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nombre" required>
                <input
                  name="nombre"
                  required
                  maxLength={100}
                  defaultValue={
                    editor.mode === "edit" ? editor.item.nombre : ""
                  }
                  className={inputClassName}
                  placeholder="Ej. Matutino"
                />
              </Field>
              <Field label="Área" required>
                <select
                  name="areaId"
                  required
                  defaultValue={
                    editor.mode === "edit"
                      ? editor.item.areaId
                      : manageableAreas[0]?.id
                  }
                  className={inputClassName}
                >
                  {manageableAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {areaLabel(area.id)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Hora de inicio" required>
                <input
                  name="horaInicio"
                  type="time"
                  required
                  defaultValue={
                    editor.mode === "edit" ? editor.item.horaInicio : "08:00"
                  }
                  className={inputClassName}
                />
              </Field>
              <Field label="Hora de fin" required>
                <input
                  name="horaFin"
                  type="time"
                  required
                  defaultValue={
                    editor.mode === "edit" ? editor.item.horaFin : "14:00"
                  }
                  className={inputClassName}
                />
              </Field>
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-bold text-[var(--color-ink)]">
                  Días de la semana{" "}
                  <span className="text-[var(--color-accent-text)]">*</span>
                </legend>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {weekDays.map((day) => (
                    <label
                      key={day}
                      className="flex cursor-pointer items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-xs font-bold hover:bg-[var(--color-surface-inset)]"
                    >
                      <input
                        type="checkbox"
                        name="dias"
                        value={day}
                        defaultChecked={
                          editor.mode === "edit"
                            ? editor.item.dias.includes(day)
                            : !["SABADO", "DOMINGO"].includes(day)
                        }
                        className="h-4 w-4 accent-[var(--color-primary)]"
                      />
                      {dayLabels[day]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="sm:col-span-2">
                <ErrorBanner message={formError} />
              </div>
            </div>
            <FormActions
              saving={saving}
              submitLabel={
                editor.mode === "edit" ? "Guardar cambios" : "Crear turno"
              }
              onCancel={() => setEditor(null)}
            />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Dar de baja el turno"
        description={`Se desactivará ${deleteTarget?.nombre ?? "este turno"}.`}
        busy={deleting}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
