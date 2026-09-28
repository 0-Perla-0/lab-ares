"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FolderKanban, Star } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import {
  EmptyState,
  ErrorBanner,
  Field,
  FilterActionBar,
  FormActions,
  LoadError,
  LoadingTable,
  Modal,
  PageHeader,
  Pagination,
  ResponsiveList,
  ResponsiveListItem,
  StatusBadge,
  inputClassName,
  textareaClassName,
} from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
import {
  kairosApi,
  type KairosPriority,
  type KairosProject,
} from "@/lib/backend2/kairos";
import { hasPermission, permissions } from "@/lib/permissions";

const priorityTone = {
  BAJA: "neutral",
  MEDIA: "info",
  ALTA: "warning",
  CRITICA: "danger",
} as const;

export function KairosProjectsPage() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, permissions.KAIROS_PROJECT_CREATE);
  const [items, setItems] = useState<KairosProject[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await kairosApi.listProjects({
        page,
        pageSize: 12,
        search,
        favorite: onlyFavorites ? true : undefined,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }, [page, search, onlyFavorites]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setFormError("");
    try {
      await kairosApi.createProject({
        nombre: String(data.get("nombre") ?? ""),
        descripcion: String(data.get("descripcion") ?? "") || null,
        prioridad: String(data.get("prioridad") ?? "MEDIA") as KairosPriority,
      });
      setOpen(false);
      setPage(1);
      await load();
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, "save"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleFavorite(project: KairosProject) {
    try {
      const favorite = !project.favorito;
      await kairosApi.favoriteProject(project.id, favorite);
      setItems((current) =>
        current.map((item) =>
          item.id === project.id ? { ...item, favorito: favorite } : item,
        ),
      );
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trabajo colaborativo"
        title="Kairós"
        description="Proyectos, actividades, evidencias y revisiones visibles únicamente para sus integrantes."
        action={
          canCreate
            ? { label: "Nuevo proyecto", onClick: () => setOpen(true) }
            : undefined
        }
      />
      <FilterActionBar
        actions={
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setOnlyFavorites((value) => !value);
            }}
            aria-pressed={onlyFavorites}
            className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--ares-border-strong)] px-4 text-sm font-extrabold"
          >
            <Star size={17} fill={onlyFavorites ? "currentColor" : "none"} />{" "}
            Favoritos
          </button>
        }
      >
        <Field label="Buscar proyecto" id="project-search">
          <input
            className={inputClassName}
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Nombre del proyecto"
          />
        </Field>
      </FilterActionBar>
      {error && !loading ? (
        <LoadError message={error} onRetry={() => void load()} />
      ) : loading ? (
        <LoadingTable />
      ) : items.length === 0 ? (
        <EmptyState
          title="No hay proyectos"
          description={
            onlyFavorites
              ? "Todavía no marcaste proyectos como favoritos."
              : "No encontramos proyectos con estos filtros."
          }
        />
      ) : (
        <>
          <ResponsiveList label="Proyectos Kairós">
            {items.map((project) => (
              <ResponsiveListItem key={project.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-[#e9f6cb] text-[#557416]">
                    <FolderKanban size={21} />
                  </div>
                  <button
                    type="button"
                    disabled={project.estado === "ARCHIVADO"}
                    onClick={() => void toggleFavorite(project)}
                    aria-label={
                      project.favorito
                        ? `Quitar ${project.nombre} de favoritos`
                        : `Agregar ${project.nombre} a favoritos`
                    }
                    className="focus-ring grid min-h-11 min-w-11 place-items-center rounded-xl hover:bg-[var(--ares-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Star
                      size={19}
                      fill={project.favorito ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                <h2 className="mt-3 text-lg font-black">{project.nombre}</h2>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-[var(--ares-muted)]">
                  {project.descripcion || "Sin descripción"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge
                    label={project.estado}
                    tone={
                      project.estado === "ACTIVO"
                        ? "success"
                        : project.estado === "ARCHIVADO"
                          ? "neutral"
                          : "warning"
                    }
                  />
                  <StatusBadge
                    label={project.prioridad}
                    tone={priorityTone[project.prioridad]}
                  />
                  <StatusBadge label={project.rol ?? "MIEMBRO"} />
                </div>
                <Link
                  href={`/portal/kairos/${project.id}`}
                  className="focus-ring mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--ares-ink)] px-4 text-sm font-black text-white"
                >
                  Abrir proyecto
                </Link>
              </ResponsiveListItem>
            ))}
          </ResponsiveList>
          <Pagination
            page={page}
            pageSize={12}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}
      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="Nuevo proyecto"
        description="La membresía se mantiene privada y tú serás la persona propietaria."
      >
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <ErrorBanner message={formError} />
          <Field label="Nombre" required>
            <input
              name="nombre"
              className={inputClassName}
              required
              maxLength={191}
            />
          </Field>
          <Field label="Descripción">
            <textarea
              name="descripcion"
              className={textareaClassName}
              maxLength={1000}
            />
          </Field>
          <Field label="Prioridad">
            <select
              name="prioridad"
              className={inputClassName}
              defaultValue="MEDIA"
            >
              <option>BAJA</option>
              <option>MEDIA</option>
              <option>ALTA</option>
              <option>CRITICA</option>
            </select>
          </Field>
          <FormActions
            saving={saving}
            submitLabel="Crear proyecto"
            onCancel={() => setOpen(false)}
          />
        </form>
      </Modal>
    </div>
  );
}
