"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Search, Trash2, UserRound } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  ForbiddenState,
  LoadError,
  LoadingTable,
  PageHeader,
} from "@/components/ui/primitives";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import { stateLabels } from "@/lib/format";
import { canReadUsers, roleLabels, roleRank } from "@/lib/permissions";
import type {
  ApiEnvelope,
  Area,
  PublicUser,
  Sede,
  Turno,
  UserState,
} from "@/lib/types";

type Catalogs = { sedes: Sede[]; areas: Area[]; turnos: Turno[] };

const stateStyles: Record<UserState, string> = {
  ACTIVO: "bg-emerald-50 text-emerald-700",
  PENDIENTE: "bg-amber-50 text-amber-700",
  INACTIVO: "bg-slate-100 text-slate-600",
  LIBERADO: "bg-blue-50 text-blue-700",
  BAJA: "bg-red-50 text-red-700",
};

export function UsersPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PublicUser[] | null>(null);
  const [catalogs, setCatalogs] = useState<Catalogs>({
    sedes: [],
    areas: [],
    turnos: [],
  });
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PublicUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!canReadUsers(user)) return;
    setLoadError("");
    try {
      const [usersResponse, sedesResponse, areasResponse, turnosResponse] =
        await Promise.all([
          apiRequest<ApiEnvelope<PublicUser[]>>("/api/users"),
          apiRequest<ApiEnvelope<Sede[]>>("/api/organization/sedes"),
          apiRequest<ApiEnvelope<Area[]>>("/api/organization/areas"),
          apiRequest<ApiEnvelope<Turno[]>>("/api/organization/turnos"),
        ]);
      setItems(usersResponse.data);
      setCatalogs({
        sedes: sedesResponse.data,
        areas: areasResponse.data,
        turnos: turnosResponse.data,
      });
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "load"));
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items ?? [];
    return (items ?? []).filter((item) =>
      [item.codigo, item.email, roleLabels[item.rol], stateLabels[item.estado]]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [items, query]);

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError("");
    setSuccess("");
    try {
      await apiRequest(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setSuccess(`${deleteTarget.codigo} fue dado de baja correctamente.`);
      await load();
    } catch (error) {
      setDeleteTarget(null);
      setActionError(getApiErrorMessage(error, "delete"));
    } finally {
      setDeleting(false);
    }
  }

  if (!canReadUsers(user)) return <ForbiddenState />;

  const sedeName = (id: number | null) =>
    id === null
      ? "Sin sede"
      : (catalogs.sedes.find((item) => item.id === id)?.nombre ?? `Sede ${id}`);
  const areaName = (id: number | null) =>
    id === null
      ? "Sin área"
      : (catalogs.areas.find((item) => item.id === id)?.nombre ?? `Área ${id}`);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Equipo"
        title="Usuarios"
        description="Consulta a las personas dentro de tu alcance, registra nuevos accesos y mantén sus asignaciones al día."
        action={{ label: "Registrar usuario", href: "/portal/usuarios/nuevo" }}
      />

      {success && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {success}
        </div>
      )}
      {actionError && (
        <div className="mt-6">
          <ErrorBanner message={actionError} />
        </div>
      )}

      <div className="mt-7 flex items-center rounded-2xl border border-[#12221b]/10 bg-white px-4 shadow-[0_8px_30px_rgba(18,34,27,0.025)]">
        <Search size={18} className="shrink-0 text-[#8a948e]" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por código, correo, rol o estado…"
          className="h-12 w-full bg-transparent px-3 text-sm outline-none placeholder:text-[#9ba59f]"
          aria-label="Buscar usuarios"
        />
        {items && (
          <span className="shrink-0 text-[11px] font-black text-[#8a948e]">
            {filteredItems.length} de {items.length}
          </span>
        )}
      </div>

      <section className="mt-4">
        {loadError ? (
          <LoadError message={loadError} onRetry={() => void load()} />
        ) : !items ? (
          <LoadingTable />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            title={
              items.length === 0 ? "Aún no hay usuarios" : "Sin coincidencias"
            }
            description={
              items.length === 0
                ? "Los usuarios dentro de tu alcance aparecerán aquí."
                : "Prueba con otro código, correo, rol o estado."
            }
          />
        ) : (
          <div className="table-scroll overflow-x-auto rounded-2xl border border-[#12221b]/10 bg-white shadow-[0_8px_30px_rgba(18,34,27,0.035)]">
            <table className="w-full min-w-[980px] text-left">
              <thead className="border-b border-[#12221b]/10 bg-[#f4f5f1] text-[10px] font-black uppercase tracking-[0.16em] text-[#748078]">
                <tr>
                  <th className="px-5 py-4">Persona</th>
                  <th className="px-5 py-4">Rol</th>
                  <th className="px-5 py-4">Asignación</th>
                  <th className="px-5 py-4">Estado</th>
                  <th className="px-5 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#12221b]/8">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="transition hover:bg-[#fafbf7]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f0f1ed] text-[#536159]">
                          <UserRound size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-black">{item.codigo}</p>
                          <p
                            className="mt-0.5 max-w-64 truncate text-[11px] text-[#748078]"
                            title={item.email}
                          >
                            {item.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm font-extrabold text-[#435249]">
                      {roleLabels[item.rol]}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs font-bold text-[#435249]">
                        {sedeName(item.sedeId)}
                      </p>
                      <p className="mt-1 text-[11px] text-[#8a948e]">
                        {areaName(item.areaId)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${stateStyles[item.estado]}`}
                      >
                        {stateLabels[item.estado]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1.5">
                        {roleRank[item.rol] <= roleRank[user.rol] ? (
                          <Link
                            href={`/portal/usuarios/${item.id}`}
                            className="focus-ring rounded-lg p-2 text-[#66736d] hover:bg-[#eef8d5] hover:text-[#55721e]"
                            aria-label={`Editar ${item.codigo}`}
                          >
                            <Pencil size={17} />
                          </Link>
                        ) : (
                          <span
                            className="cursor-not-allowed rounded-lg p-2 text-[#66736d] opacity-25"
                            title="No puedes administrar un rol superior al tuyo"
                          >
                            <Pencil size={17} />
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={
                            item.id === user.id ||
                            roleRank[item.rol] > roleRank[user.rol]
                          }
                          onClick={() => setDeleteTarget(item)}
                          className="focus-ring rounded-lg p-2 text-[#66736d] hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-25"
                          aria-label={
                            item.id === user.id
                              ? "No puedes darte de baja"
                              : roleRank[item.rol] > roleRank[user.rol]
                                ? "No puedes administrar un rol superior al tuyo"
                                : `Dar de baja ${item.codigo}`
                          }
                          title={
                            item.id === user.id
                              ? "No puedes darte de baja"
                              : roleRank[item.rol] > roleRank[user.rol]
                                ? "No puedes administrar un rol superior al tuyo"
                                : undefined
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Dar de baja al usuario"
        description={`${deleteTarget?.codigo ?? "Esta persona"} perderá el acceso al portal.`}
        busy={deleting}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
