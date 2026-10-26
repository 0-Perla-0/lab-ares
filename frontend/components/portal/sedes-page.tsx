"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Pencil, Trash2 } from "lucide-react";

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
  textareaClassName,
} from "@/components/ui/primitives";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import {
  canCreateSede,
  canManageOrganization,
  canManageSede,
} from "@/lib/permissions";
import type { ApiEnvelope, Sede } from "@/lib/types";

type Editor = { mode: "create" } | { mode: "edit"; item: Sede };

export function SedesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Sede[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sede | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const response = await apiRequest<ApiEnvelope<Sede[]>>(
        "/api/organization/sedes",
      );
      setItems(response.data);
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "load"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setFormError("");
    setSuccess("");

    const data = new FormData(event.currentTarget);
    const payload = {
      nombre: String(data.get("nombre") ?? ""),
      direccion: String(data.get("direccion") ?? "").trim() || null,
    };

    try {
      const isEdit = editor.mode === "edit";
      await durableRequest(
        user.id,
        isEdit ? "org-sede-update" : "org-sede-create",
        isEdit ? String(editor.item.id) : payload.nombre,
        isEdit
          ? `/api/organization/sedes/${editor.item.id}`
          : "/api/organization/sedes",
        isEdit ? "PUT" : "POST",
        payload,
      );
      setEditor(null);
      setSuccess(
        isEdit
          ? "La sede se actualizó correctamente."
          : "La sede fue creada correctamente.",
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
        "org-sede-deactivate",
        String(deleteTarget.id),
        `/api/organization/sedes/${deleteTarget.id}`,
        "DELETE",
      );
      setDeleteTarget(null);
      setSuccess("La sede y su estructura dependiente quedaron inactivas.");
      await load();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "delete"));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Organización"
        title="Sedes"
        description="Consulta los espacios que conforman la organización y administra su información según tu alcance."
        action={
          canCreateSede(user)
            ? {
                label: "Nueva sede",
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
        ) : !items ? (
          <LoadingTable />
        ) : items.length === 0 ? (
          <EmptyState
            title="Aún no hay sedes"
            description="Cuando se registre la primera sede aparecerá aquí."
          />
        ) : (
          <div className="table-scroll overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <table className="w-full min-w-[680px] text-left">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-inset)] text-xs font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-muted)]">
                <tr>
                  <th className="px-5 py-4">Sede</th>
                  <th className="px-5 py-4">Dirección</th>
                  <th className="px-5 py-4">Estado</th>
                  {canManageOrganization(user) && (
                    <th className="px-5 py-4 text-right">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {items.map((item) => {
                  const manageable = canManageSede(user, item.id);
                  return (
                    <tr
                      key={item.id}
                      className="transition hover:bg-[var(--color-surface-inset)]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]">
                            <MapPin size={18} />
                          </span>
                          <div>
                            <p className="text-sm font-bold">{item.nombre}</p>
                            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                              ID {item.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-md px-5 py-4 text-sm text-[var(--color-muted)]">
                        {item.direccion || "Sin dirección registrada"}
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
        title={editor?.mode === "edit" ? "Editar sede" : "Registrar sede"}
        description="Los nombres deben ser únicos dentro de la organización."
      >
        {editor && (
          <form onSubmit={save}>
            <div className="space-y-5">
              <Field label="Nombre" required>
                <input
                  name="nombre"
                  required
                  maxLength={150}
                  defaultValue={
                    editor.mode === "edit" ? editor.item.nombre : ""
                  }
                  className={inputClassName}
                  placeholder="Ej. Sede Centro"
                />
              </Field>
              <Field label="Dirección" hint="Opcional · máximo 255 caracteres">
                <textarea
                  name="direccion"
                  maxLength={255}
                  defaultValue={
                    editor.mode === "edit" ? (editor.item.direccion ?? "") : ""
                  }
                  className={textareaClassName}
                  placeholder="Calle, número, colonia y ciudad"
                />
              </Field>
              <ErrorBanner message={formError} />
            </div>
            <FormActions
              saving={saving}
              submitLabel={
                editor.mode === "edit" ? "Guardar cambios" : "Crear sede"
              }
              onCancel={() => setEditor(null)}
            />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Dar de baja la sede"
        description={`Se desactivará ${deleteTarget?.nombre ?? "esta sede"}, sus áreas y sus turnos.`}
        busy={deleting}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
