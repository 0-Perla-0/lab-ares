import { ApiError } from "@/lib/api";

export type ReportType = "ATTENDANCE" | "DOCUMENTS" | "KAIROS";

export type GroupMetric = {
  status?: string;
  estado?: string;
  state?: string;
  _count: { _all: number };
  _sum?: { durationSeconds?: number | null };
};

export type OperationalMetrics = {
  from: string;
  to: string;
  attendance: GroupMetric[];
  documents: GroupMetric[];
  kairos: { byState: GroupMetric[]; overdue: number };
  semantics: string;
};

export type ExportJob = {
  id: string;
  type: ReportType;
  status: "PENDIENTE" | "GENERANDO" | "COMPLETADO" | "FALLIDO" | "EXPIRADO";
  totalFilas?: number | null;
  errorCode?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

async function responseError(response: Response) {
  let code = "REQUEST_FAILED";
  try {
    const body = (await response.json()) as { error?: string };
    code = body.error ?? code;
  } catch {}
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("ares:unauthorized"));
  }
  throw new ApiError(response.status, code);
}

export function reportRangeQuery(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
  if (to) {
    const exclusive = new Date(`${to}T00:00:00`);
    exclusive.setDate(exclusive.getDate() + 1);
    params.set("to", exclusive.toISOString());
  }
  return params.toString();
}

export async function getOperationalMetrics(from?: string, to?: string) {
  const query = reportRangeQuery(from, to);
  const response = await fetch(
    `/api/reports/operational-metrics${query ? `?${query}` : ""}`,
    { credentials: "include", cache: "no-store" },
  );
  if (!response.ok) await responseError(response);
  return ((await response.json()) as { data: OperationalMetrics }).data;
}

export async function requestReportExport(
  type: ReportType,
  from?: string,
  to?: string,
): Promise<
  | { kind: "download"; blob: Blob; filename: string }
  | { kind: "job"; job: ExportJob }
> {
  const range = new URLSearchParams(reportRangeQuery(from, to));
  const body = {
    type,
    ...(range.get("from") ? { from: range.get("from") } : {}),
    ...(range.get("to") ? { to: range.get("to") } : {}),
  };
  const response = await fetch("/api/reports/export", {
    method: "POST",
    headers: jsonHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (!response.ok) await responseError(response);
  if (response.status === 202) {
    return {
      kind: "job",
      job: ((await response.json()) as { data: ExportJob }).data,
    };
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename =
    /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? "reporte.csv";
  return { kind: "download", blob: await response.blob(), filename };
}

export async function getReportExportStatus(id: string) {
  const response = await fetch(
    `/api/reports/export/${encodeURIComponent(id)}/status`,
    { credentials: "include", cache: "no-store" },
  );
  if (!response.ok) await responseError(response);
  return ((await response.json()) as { data: ExportJob }).data;
}

export async function getReportExportDownload(id: string) {
  const response = await fetch(
    `/api/reports/export/${encodeURIComponent(id)}/download`,
    { credentials: "include", cache: "no-store" },
  );
  if (!response.ok) await responseError(response);
  return ((await response.json()) as { data: string }).data;
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
