"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers3, Pencil, Trash2 } from "lucide-react";

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
      await durableRequest(
        user.id,
        isEdit ? "org-area-update" : "org-area-create",
        isEdit ? String(editor.item.id) : `${payload.sedeId}:${payload.nombre}`,
        isEdit
          ? `/api/organization/areas/${editor.item.id}`
          : "/api/organization/areas",
        isEdit ? "PUT" : "POST",
        payload,
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
      await durableRequest(
        user.id,
        "org-area-deactivate",
        String(deleteTarget.id),
        `/api/organization/areas/${deleteTarget.id}`,
        "DELETE",
      );
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
        ) : !areas ? (
          <LoadingTable />
        ) : areas.length === 0 ? (
          <EmptyState
            title="Aún no hay áreas"
            description="Las áreas registradas aparecerán en esta sección."
          />
        ) : (
          <div className="table-scroll overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <table className="w-full min-w-[650px] text-left">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-inset)] text-xs font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-muted)]">
                <tr>
                  <th className="px-5 py-4">Área</th>
                  <th className="px-5 py-4">Sede</th>
                  <th className="px-5 py-4">Estado</th>
                  {canManageOrganization(user) && (
                    <th className="px-5 py-4 text-right">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {areas.map((item) => {
                  const manageable = canManageSede(user, item.sedeId);
                  return (
                    <tr
                      key={item.id}
                      className="transition hover:bg-[var(--color-surface-inset)]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]">
                            <Layers3 size={18} />
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
                        {sedeName(item.sedeId)}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-[var(--color-success-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-success-text)]">
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
