"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react";

import {
  EmptyState,
  ErrorBanner,
  Field,
  LoadError,
  LoadingTable,
  PageHeader,
  Panel,
  StatusBadge,
  inputClassName,
  type StatusTone,
} from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
import {
  getOperationalMetrics,
  getReportExportDownload,
  getReportExportStatus,
  requestReportExport,
  saveBlob,
  type ExportJob,
  type OperationalMetrics,
  type ReportType,
} from "@/lib/backend2/reports";

const jobTone: Record<ExportJob["status"], StatusTone> = {
  PENDIENTE: "warning",
  GENERANDO: "info",
  COMPLETADO: "success",
  FALLIDO: "danger",
  EXPIRADO: "neutral",
};

export function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  const [range, setRange] = useState({ from: monthAgo, to: today });
  const [metrics, setMetrics] = useState<OperationalMetrics | null>(null);
  const [type, setType] = useState<ReportType>("ATTENDANCE");
  const [job, setJob] = useState<ExportJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setMetrics(await getOperationalMetrics(range.from, range.to));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (!job || !["PENDIENTE", "GENERANDO"].includes(job.status)) return;
    let active = true;
    const timer = window.setInterval(() => {
      void getReportExportStatus(job.id)
        .then((next) => {
          if (active) setJob(next);
        })
        .catch((requestError) => {
          if (active) setError(getApiErrorMessage(requestError, "load"));
        });
    }, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [job]);

  const totals = useMemo(
    () => ({
      attendance:
        metrics?.attendance.reduce((sum, row) => sum + row._count._all, 0) ?? 0,
      documents:
        metrics?.documents.reduce((sum, row) => sum + row._count._all, 0) ?? 0,
      kairos:
        metrics?.kairos.byState.reduce(
          (sum, row) => sum + row._count._all,
          0,
        ) ?? 0,
    }),
    [metrics],
  );

  function submitRange(event: FormEvent) {
    event.preventDefault();
    if (range.from && range.to && range.from > range.to) {
      setError("La fecha inicial no puede ser posterior a la final.");
      return;
    }
    void load();
  }

  async function exportReport() {
    setExporting(true);
    setError("");
    setNotice("");
    setJob(null);
    try {
      const result = await requestReportExport(type, range.from, range.to);
      if (result.kind === "download") {
        saveBlob(result.blob, result.filename);
        setNotice("CSV generado y descargado.");
      } else {
        setJob(result.job);
        setNotice("La exportación es grande: se generará en segundo plano.");
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "save"));
    } finally {
      setExporting(false);
    }
  }

  async function downloadJob() {
    if (!job) return;
    setError("");
    try {
      const url = await getReportExportDownload(job.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    }
  }

  if (loading && !metrics) return <LoadingTable />;
  if (error && !metrics)
    return <LoadError message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operación"
        title="Reportes"
        description="Métricas por rango con exportación CSV inmediata o procesada como trabajo en segundo plano."
      />
      <ErrorBanner message={error} />
      {notice && (
        <div
          role="status"
          className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-900"
        >
          {notice}
        </div>
      )}

      <Panel
        title="Rango del reporte"
        description="La fecha final se convierte a límite exclusivo para incluir el día completo."
      >
        <form onSubmit={submitRange} className="grid gap-4 sm:grid-cols-3">
          <Field label="Desde">
            <input
              className={inputClassName}
              type="date"
              value={range.from}
              onChange={(event) =>
                setRange((old) => ({ ...old, from: event.target.value }))
              }
            />
          </Field>
          <Field label="Hasta">
            <input
              className={inputClassName}
              type="date"
              min={range.from}
              value={range.to}
              onChange={(event) =>
                setRange((old) => ({ ...old, to: event.target.value }))
              }
            />
          </Field>
          <button
            disabled={loading}
            className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#12221b] px-5 text-sm font-black text-white sm:self-end"
          >
            <RefreshCw size={16} />{" "}
            {loading ? "Actualizando…" : "Actualizar métricas"}
          </button>
        </form>
      </Panel>

      {metrics ? (
        <section
          aria-label="Métricas operativas"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <Metric
            label="Asistencias"
            value={totals.attendance}
            detail={
              metrics.attendance
                .map((row) => `${row.status}: ${row._count._all}`)
                .join(" · ") || "Sin registros"
            }
          />
          <Metric
            label="Versiones documentales"
            value={totals.documents}
            detail={
              metrics.documents
                .map((row) => `${row.estado}: ${row._count._all}`)
                .join(" · ") || "Sin registros"
            }
          />
          <Metric
            label="Actividades Kairos"
            value={totals.kairos}
            detail={
              metrics.kairos.byState
                .map((row) => `${row.state}: ${row._count._all}`)
                .join(" · ") || "Sin registros"
            }
          />
          <Metric
            label="Kairos vencidas"
            value={metrics.kairos.overdue}
            detail="No terminadas o canceladas antes del límite."
          />
        </section>
      ) : (
        <EmptyState
          title="Sin métricas"
          description="Selecciona un rango para consultar la operación."
        />
      )}

      <Panel
        title="Exportar CSV"
        description="Si supera el límite síncrono, el estado se consulta automáticamente hasta terminar."
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Conjunto de datos">
            <select
              className={inputClassName}
              value={type}
              onChange={(event) => setType(event.target.value as ReportType)}
            >
              <option value="ATTENDANCE">Asistencia</option>
              <option value="DOCUMENTS">Documentos</option>
              <option value="KAIROS">Kairos</option>
            </select>
          </Field>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void exportReport()}
            className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#12221b] px-5 text-sm font-black text-white"
          >
            <FileSpreadsheet size={17} />{" "}
            {exporting ? "Solicitando…" : "Generar CSV"}
          </button>
        </div>
        {job && (
          <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-[var(--ares-border)] bg-[#f4f0e7] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-black">Exportación {job.id}</p>
                <StatusBadge label={job.status} tone={jobTone[job.status]} />
              </div>
              <p className="mt-1 text-sm text-[var(--ares-muted)]">
                {job.totalFilas ?? "—"} filas
                {job.errorCode ? ` · ${job.errorCode}` : ""}
              </p>
            </div>
            {job.status === "COMPLETADO" && (
              <button
                type="button"
                onClick={() => void downloadJob()}
                className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white"
              >
                <Download size={16} /> Descargar resultado
              </button>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-[var(--ares-border)] bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-[var(--ares-muted)]">
        {label}
      </p>
      <p className="mt-2 text-4xl font-black tracking-tight">{value}</p>
      <p className="mt-3 text-xs leading-5 text-[var(--ares-muted)]">
        {detail}
      </p>
    </article>
  );
}
