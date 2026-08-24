"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Pencil, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
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
    if (horaInicio >= horaFin) {
      setFormError("La hora de inicio debe ser anterior a la hora de fin.");
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
      await apiRequest(
        isEdit
          ? `/api/organization/turnos/${editor.item.id}`
          : "/api/organization/turnos",
        { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) },
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
      await apiRequest(`/api/organization/turnos/${deleteTarget.id}`, {
        method: "DELETE",
      });
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
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
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
          <div className="table-scroll overflow-x-auto rounded-2xl border border-[#12221b]/10 bg-white shadow-[0_8px_30px_rgba(18,34,27,0.035)]">
            <table className="w-full min-w-[840px] text-left">
              <thead className="border-b border-[#12221b]/10 bg-[#f4f5f1] text-[10px] font-black uppercase tracking-[0.16em] text-[#748078]">
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
              <tbody className="divide-y divide-[#12221b]/8">
                {turnos.map((item) => {
                  const area = areaById(item.areaId);
                  const manageable = area
                    ? canManageSede(user, area.sedeId)
                    : false;
                  return (
                    <tr key={item.id} className="transition hover:bg-[#fafbf7]">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e9f2ff] text-[#376c9b]">
                            <Clock3 size={18} />
                          </span>
                          <div>
                            <p className="text-sm font-black">{item.nombre}</p>
                            <p className="mt-0.5 text-[11px] text-[#8a948e]">
                              ID {item.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-[#536159]">
                        {areaLabel(item.areaId)}
                      </td>
                      <td className="px-5 py-4 text-sm font-black tabular-nums">
                        {item.horaInicio} – {item.horaFin}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {item.dias.map((day) => (
                            <span
                              key={day}
                              className="rounded-md bg-[#f0f1ed] px-2 py-1 text-[10px] font-black text-[#59675f]"
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
                              className="focus-ring rounded-lg p-2 text-[#66736d] hover:bg-[#eef8d5] hover:text-[#55721e] disabled:cursor-not-allowed disabled:opacity-25"
                              aria-label={`Editar ${item.nombre}`}
                            >
                              <Pencil size={17} />
                            </button>
                            <button
                              type="button"
                              disabled={!manageable}
                              onClick={() => setDeleteTarget(item)}
                              className="focus-ring rounded-lg p-2 text-[#66736d] hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-25"
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
        description="El horario utiliza formato de 24 horas y requiere al menos un día."
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
                <legend className="text-sm font-extrabold text-[#32473d]">
                  Días de la semana <span className="text-[#db6531]">*</span>
                </legend>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {weekDays.map((day) => (
                    <label
                      key={day}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#12221b]/10 bg-white px-3 py-2.5 text-xs font-bold hover:bg-[#f7f8f4]"
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
                        className="h-4 w-4 accent-[#769a27]"
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
