import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Field,
  LoadingTable,
  StatusBadge,
  inputClassName,
} from "@/components/ui/primitives";
import { apiRequest } from "@/lib/api";
import { fileScanPresentation } from "@/lib/backend2/file-upload";
import {
  actionIdempotencyKey,
  clearActionIdempotencyKey,
} from "@/lib/backend2/idempotency";
import { visibleBackend2Navigation } from "@/lib/backend2/navigation";
import { hasPermission, permissionScope, permissions } from "@/lib/permissions";
import type { AuthUser } from "@/lib/types";

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 17,
    codigo: "A0017",
    email: "user@example.com",
    rol: "ADMIN",
    estado: "ACTIVO",
    sedeId: 1,
    areaId: 2,
    turnoId: 3,
    ...overrides,
  };
}

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("explicit Backend 2 permissions", () => {
  it("does not infer a grant from an administrative role", () => {
    const current = user();
    expect(permissionScope(current, permissions.RETENTION_EXECUTE)).toBeNull();
    expect(hasPermission(current, permissions.RETENTION_EXECUTE)).toBe(false);
  });

  it("uses the exact backend scope and required minimum", () => {
    const current = user({
      permissions: {
        [permissions.DOCUMENTS_READ]: "area",
        [permissions.PRINTING_3D_REQUEST]: "self",
      },
    });
    expect(permissionScope(current, permissions.DOCUMENTS_READ)).toBe("area");
    expect(hasPermission(current, permissions.DOCUMENTS_READ, "area")).toBe(
      true,
    );
    expect(hasPermission(current, permissions.DOCUMENTS_READ, "sede")).toBe(
      false,
    );
  });

  it("only reveals navigation groups backed by an explicit grant", () => {
    const groups = visibleBackend2Navigation(
      user({
        permissions: {
          [permissions.DIRECTORY_READ]: "global",
          [permissions.RETENTION_REQUEST]: "self",
        },
      }),
    );
    const labels = groups.flatMap((group) =>
      group.items.map((item) => item.label),
    );
    expect(labels).toEqual(["Directorio", "Retención y supresión"]);
    expect(labels).not.toContain("Reportes");
  });
});

describe("shared request helpers", () => {
  it("keeps an idempotency key stable for the same canonical action payload", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", storage());
    const first = actionIdempotencyKey({
      userId: 17,
      action: "retention:request",
      target: "self",
      payload: { reason: "Corrección", category: "identity" },
    });
    const retry = actionIdempotencyKey({
      userId: 17,
      action: "retention:request",
      target: "self",
      payload: { category: "identity", reason: "Corrección" },
    });
    const changed = actionIdempotencyKey({
      userId: 17,
      action: "retention:request",
      target: "self",
      payload: { category: "academic", reason: "Corrección" },
    });
    expect(retry).toBe(first);
    expect(changed).not.toBe(first);
    clearActionIdempotencyKey({
      userId: 17,
      action: "retention:request",
      target: "self",
    });
  });

  it("lets the browser set the multipart boundary and preserves JSON headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const multipart = new FormData();
    multipart.append("file", new Blob(["hello"]), "hello.txt");
    await apiRequest("/api/files", { method: "POST", body: multipart });
    const multipartHeaders = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(multipartHeaders.has("Content-Type")).toBe(false);

    await apiRequest("/api/example", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });
    const jsonHeaders = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(jsonHeaders.get("Content-Type")).toBe("application/json");
  });
});

describe("accessible shared states", () => {
  it.each([
    ["PENDIENTE_ANALISIS", "PENDIENTE", "Archivo pendiente de análisis"],
    ["ANALIZANDO", "EN_ANALISIS", "Analizando el archivo"],
    ["DISPONIBLE", "DISPONIBLE", "Archivo disponible"],
    ["RECHAZADO", "RECHAZADO", "Archivo rechazado"],
  ] as const)("maps %s to a textual %s state", (status, stage, label) => {
    expect(fileScanPresentation(status)).toMatchObject({ stage, label });
  });

  it("renders status and loading feedback with screen-reader semantics", () => {
    const status = renderToStaticMarkup(
      <StatusBadge label="EN ANÁLISIS" tone="info" />,
    );
    const loading = renderToStaticMarkup(<LoadingTable />);
    expect(status).toContain("EN ANÁLISIS");
    expect(status).toContain('aria-hidden="true"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain('aria-busy="true"');
  });

  it("connects field errors through aria-invalid and aria-describedby", () => {
    const html = renderToStaticMarkup(
      <Field label="Nombre" hint="Máximo 80 caracteres" error="Es obligatorio">
        <input className={inputClassName} />
      </Field>,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("aria-describedby=");
    expect(html).toContain("Es obligatorio");
  });
});
