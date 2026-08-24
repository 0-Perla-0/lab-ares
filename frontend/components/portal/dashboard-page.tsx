"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  Clock3,
  MapPinned,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { LoadError, LoadingTable } from "@/components/ui/primitives";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import { canReadUsers, roleLabels } from "@/lib/permissions";
import type { ApiEnvelope, Area, PublicUser, Sede, Turno } from "@/lib/types";

type DashboardData = {
  sedes: Sede[];
  areas: Area[];
  turnos: Turno[];
  users: PublicUser[] | null;
  backendReady: boolean;
};

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [
        sedesResponse,
        areasResponse,
        turnosResponse,
        usersResponse,
        health,
      ] = await Promise.all([
        apiRequest<ApiEnvelope<Sede[]>>("/api/organization/sedes"),
        apiRequest<ApiEnvelope<Area[]>>("/api/organization/areas"),
        apiRequest<ApiEnvelope<Turno[]>>("/api/organization/turnos"),
        canReadUsers(user)
          ? apiRequest<ApiEnvelope<PublicUser[]>>("/api/users")
          : Promise.resolve(null),
        apiRequest("/api/health/ready").then(
          () => true,
          () => false,
        ),
      ]);
      setData({
        sedes: sedesResponse.data,
        areas: areasResponse.data,
        turnos: turnosResponse.data,
        users: usersResponse?.data ?? null,
        backendReady: health,
      });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <LoadError message={error} onRetry={() => void load()} />;
  if (!data) return <LoadingTable />;

  const sede = data.sedes.find((item) => item.id === user.sedeId);
  const area = data.areas.find((item) => item.id === user.areaId);
  const turno = data.turnos.find((item) => item.id === user.turnoId);
  const cards = [
    {
      label: "Sedes activas",
      value: data.sedes.length,
      href: "/portal/sedes",
      icon: Building2,
    },
    {
      label: "Áreas activas",
      value: data.areas.length,
      href: "/portal/areas",
      icon: MapPinned,
    },
    {
      label: "Turnos activos",
      value: data.turnos.length,
      href: "/portal/turnos",
      icon: Clock3,
    },
    ...(data.users
      ? [
          {
            label: "Personas visibles",
            value: data.users.length,
            href: "/portal/usuarios",
            icon: UsersRound,
          },
        ]
      : []),
  ];

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.19em] text-[#769a27]">
            Panel principal
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
            Hola, {user.codigo}.
          </h1>
          <p className="mt-2 text-sm text-[#66736d]">
            Este es el estado actual de tu espacio de trabajo.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#12221b]/10 bg-white px-4 py-2 text-xs font-extrabold">
          <span
            className={`h-2 w-2 rounded-full ${data.backendReady ? "bg-emerald-500" : "bg-red-500"}`}
          />
          {data.backendReady
            ? "Servicios operativos"
            : "Servicio no disponible"}
        </div>
      </div>

      <section
        className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Resumen"
      >
        {cards.map(({ label, value, href, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="focus-ring group rounded-2xl border border-[#12221b]/10 bg-white p-5 shadow-[0_8px_28px_rgba(18,34,27,0.035)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(18,34,27,0.08)]"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef8d5] text-[#55721e]">
                <Icon size={19} />
              </span>
              <ArrowUpRight
                size={17}
                className="text-[#9ba59f] transition group-hover:text-[#12221b]"
              />
            </div>
            <p className="mt-6 text-3xl font-black tracking-[-0.05em]">
              {value}
            </p>
            <p className="mt-1 text-xs font-bold text-[#66736d]">{label}</p>
          </Link>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[1.6rem] border border-[#12221b]/10 bg-[#12221b] p-6 text-white sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#c8f169] text-[#12221b]">
              <ShieldCheck size={21} />
            </span>
            <div>
              <p className="text-xs font-bold text-white/45">
                Tu responsabilidad
              </p>
              <h2 className="text-lg font-black">{roleLabels[user.rol]}</h2>
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {[
              ["Sede", sede?.nombre ?? "Sin asignar"],
              ["Área", area?.nombre ?? "Sin asignar"],
              ["Turno", turno?.nombre ?? "Sin asignar"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white/7 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
                  {label}
                </p>
                <p
                  className="mt-2 truncate text-sm font-extrabold text-white/85"
                  title={value}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-[#12221b]/10 bg-[#c8f169] p-6 sm:p-8">
          <p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#55721e]">
            Cuenta activa
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">
            Tu acceso está listo.
          </h2>
          <p className="mt-3 break-all text-sm leading-6 text-[#435249]">
            {user.email}
          </p>
          <p className="mt-6 text-xs font-bold text-[#55721e]">
            Código {user.codigo}
          </p>
        </div>
      </section>
    </div>
  );
}
