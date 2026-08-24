"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers3, Pencil, Trash2 } from "lucide-react";

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
import { canManageOrganization, canManageSede } from "@/lib/permissions";
import type { ApiEnvelope, Area, Sede } from "@/lib/types";

type Editor = { mode: "create" } | { mode: "edit"; item: Area };

export function AreasPage() {
  const { user } = useAuth();
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [areasResponse, sedesResponse] = await Promise.all([
        apiRequest<ApiEnvelope<Area[]>>("/api/organization/areas"),
        apiRequest<ApiEnvelope<Sede[]>>("/api/organization/sedes"),
      ]);
      setAreas(areasResponse.data);
      setSedes(sedesResponse.data);
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "load"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const manageableSedes = useMemo(
    () => sedes.filter((sede) => canManageSede(user, sede.id)),
    [sedes, user],
  );

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setFormError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    const payload = {
      nombre: String(data.get("nombre") ?? ""),
      sedeId: Number(data.get("sedeId")),
    };

    try {
      const isEdit = editor.mode === "edit";
      await apiRequest(
        isEdit
          ? `/api/organization/areas/${editor.item.id}`
          : "/api/organization/areas",
        { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) },
      );
      setEditor(null);
      setSuccess(
        isEdit
          ? "El área se actualizó correctamente."
          : "El área fue creada correctamente.",
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
      await apiRequest(`/api/organization/areas/${deleteTarget.id}`, {
        method: "DELETE",
      });
      setDeleteTarget(null);
      setSuccess("El área y sus turnos quedaron inactivos.");
      await load();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "delete"));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const sedeName = (id: number) =>
    sedes.find((sede) => sede.id === id)?.nombre ?? `Sede ${id}`;
  const canCreate = canManageOrganization(user) && manageableSedes.length > 0;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Organización"
        title="Áreas"
        description="Explora las áreas activas y su relación con cada sede. Los cambios respetan tu alcance organizacional."
        action={
          canCreate
            ? {
                label: "Nueva área",
                onClick: () => {
                  setFormError("");
                  setSuccess("");
                  setEditor({ mode: "create" });
                },
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
        ) : !areas ? (
          <LoadingTable />
        ) : areas.length === 0 ? (
          <EmptyState
            title="Aún no hay áreas"
            description="Las áreas registradas aparecerán en esta sección."
          />
        ) : (
          <div className="table-scroll overflow-x-auto rounded-2xl border border-[#12221b]/10 bg-white shadow-[0_8px_30px_rgba(18,34,27,0.035)]">
            <table className="w-full min-w-[650px] text-left">
              <thead className="border-b border-[#12221b]/10 bg-[#f4f5f1] text-[10px] font-black uppercase tracking-[0.16em] text-[#748078]">
                <tr>
                  <th className="px-5 py-4">Área</th>
                  <th className="px-5 py-4">Sede</th>
                  <th className="px-5 py-4">Estado</th>
                  {canManageOrganization(user) && (
                    <th className="px-5 py-4 text-right">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#12221b]/8">
                {areas.map((item) => {
                  const manageable = canManageSede(user, item.sedeId);
                  return (
                    <tr key={item.id} className="transition hover:bg-[#fafbf7]">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0e9] text-[#c75b2a]">
                            <Layers3 size={18} />
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
                        {sedeName(item.sedeId)}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                          Activa
                        </span>
                      </td>
                      {canManageOrganization(user) && (
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={!manageable}
                              onClick={() => {
                                setFormError("");
                                setSuccess("");
                                setEditor({ mode: "edit", item });
                              }}
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
        title={editor?.mode === "edit" ? "Editar área" : "Registrar área"}
        description="Cada nombre debe ser único dentro de su sede."
      >
        {editor && (
          <form onSubmit={save}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nombre" required>
                <input
                  name="nombre"
                  required
                  maxLength={150}
                  defaultValue={
                    editor.mode === "edit" ? editor.item.nombre : ""
                  }
                  className={inputClassName}
                  placeholder="Ej. Desarrollo"
                />
              </Field>
              <Field label="Sede" required>
                <select
                  name="sedeId"
                  required
                  defaultValue={
                    editor.mode === "edit"
                      ? editor.item.sedeId
                      : manageableSedes[0]?.id
                  }
                  className={inputClassName}
                >
                  {manageableSedes.map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <ErrorBanner message={formError} />
              </div>
            </div>
            <FormActions
              saving={saving}
              submitLabel={
                editor.mode === "edit" ? "Guardar cambios" : "Crear área"
              }
              onCancel={() => setEditor(null)}
            />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Dar de baja el área"
        description={`Se desactivará ${deleteTarget?.nombre ?? "esta área"} y todos sus turnos.`}
        busy={deleting}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
