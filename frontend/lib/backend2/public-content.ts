import { apiRequest } from "@/lib/api";
import {
  actionIdempotencyKey,
  clearActionIdempotencyKey,
} from "@/lib/backend2/idempotency";
import type { ApiEnvelope } from "@/lib/types";

export const publicPageSlugs = [
  "inicio",
  "servicio-social",
  "preguntas-frecuentes",
  "acerca-de-ares",
  "contacto",
  "informacion-legal",
] as const;
export type PublicPageSlug = (typeof publicPageSlugs)[number];
export type PublicBlock =
  | { id?: string; orden: number; tipo: "TEXTO"; contenido: { texto: string } }
  | {
      id?: string;
      orden: number;
      tipo: "ENCABEZADO";
      contenido: { texto: string; nivel: number };
    }
  | {
      id?: string;
      orden: number;
      tipo: "LISTA";
      contenido: { elementos: string[]; ordenada: boolean };
    }
  | {
      id?: string;
      orden: number;
      tipo: "ENLACE";
      contenido: { etiqueta: string; url: string; nuevaVentana: boolean };
    }
  | {
      id?: string;
      orden: number;
      tipo: "AVISO";
      contenido: {
        titulo?: string;
        texto: string;
        tono: "INFORMATIVO" | "ADVERTENCIA" | "EXITO";
      };
    }
  | {
      id?: string;
      orden: number;
      tipo: "IMAGEN";
      activoPublicoId?: string;
      activo?: { id: string; url: string; mime: string };
      contenido: { alt: string; pie?: string };
    }
  | {
      id?: string;
      orden: number;
      tipo: "FAQ";
      contenido: { pregunta: string; respuesta: string };
    };
export type EditablePublicBlock = PublicBlock extends infer Block
  ? Block extends PublicBlock
    ? Omit<Block, "id" | "activo">
    : never
  : never;
export type PublicPageVersionInput = {
  titulo: string;
  resumenCambios: string;
  seoTitulo?: string;
  seoDescripcion?: string;
  bloques: EditablePublicBlock[];
};
export type PublishedPage = {
  slug: PublicPageSlug;
  titulo: string;
  estado: "PUBLICADO";
  metadata: {
    version: number;
    resumenCambios: string;
    publishedAt?: string;
    seoTitulo?: string | null;
    seoDescripcion?: string | null;
  };
  bloques: PublicBlock[];
};
export type AdminPublicVersion = PublicPageVersionInput & {
  id: string;
  numero: number;
  estado: "BORRADOR" | "PUBLICADO" | "ARCHIVADO";
  createdAt?: string;
  publishedAt?: string | null;
};
export type AdminPublicPage = {
  id: string;
  slug: PublicPageSlug;
  estado: "BORRADOR" | "PUBLICADO" | "ARCHIVADO";
  versiones: AdminPublicVersion[];
  updatedAt?: string;
};
export type AdminPublicPageList = {
  items: AdminPublicPage[];
  total: number;
  page: number;
  pageSize: number;
};
export type PublicAsset = {
  id: string;
  url?: string;
  expiresIn?: number;
  mime: string;
  nombre?: string;
  activo?: boolean;
};

const body = (value?: unknown): RequestInit => ({
  method: "POST",
  ...(value === undefined ? {} : { body: JSON.stringify(value) }),
});

// Mutaciones de páginas: la clave sigue ligada a acción+destino+cuerpo hasta confirmar la respuesta.
async function mutate<T>(
  userId: number,
  action: string,
  target: string,
  path: string,
  payload?: unknown,
) {
  const key = actionIdempotencyKey({ userId, action, target, payload });
  const response = await apiRequest<ApiEnvelope<T>>(path, {
    ...body(payload),
    headers: { "Idempotency-Key": key },
  });
  clearActionIdempotencyKey({ userId, action, target });
  return response.data;
}

export const publicContentApi = {
  publishedPage(slug: string) {
    return apiRequest<ApiEnvelope<PublishedPage>>(
      `/api/public-content/pages/${encodeURIComponent(slug)}`,
    ).then((result) => result.data);
  },
  faq() {
    return apiRequest<ApiEnvelope<PublishedPage>>(
      "/api/public-content/faq",
    ).then((result) => result.data);
  },
  asset(id: string) {
    return apiRequest<ApiEnvelope<PublicAsset>>(
      `/api/public-content/assets/${encodeURIComponent(id)}`,
    ).then((result) => result.data);
  },
  listAdmin(page = 1, estado = "") {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (estado) params.set("estado", estado);
    return apiRequest<ApiEnvelope<AdminPublicPageList>>(
      `/api/public-content/admin/pages?${params}`,
    ).then((result) => result.data);
  },
  detailAdmin(id: string) {
    return apiRequest<ApiEnvelope<AdminPublicPage>>(
      `/api/public-content/admin/pages/${encodeURIComponent(id)}`,
    ).then((result) => result.data);
  },
  createPage(
    userId: number,
    input: PublicPageVersionInput & { slug: PublicPageSlug },
  ) {
    return mutate<AdminPublicPage>(
      userId,
      "public-content:create-page",
      input.slug,
      "/api/public-content/admin/pages",
      input,
    );
  },
  createVersion(userId: number, id: string, input: PublicPageVersionInput) {
    return mutate<AdminPublicVersion>(
      userId,
      "public-content:create-version",
      id,
      `/api/public-content/admin/pages/${encodeURIComponent(id)}/versions`,
      input,
    );
  },
  publish(userId: number, versionId: string) {
    return mutate<AdminPublicVersion>(
      userId,
      "public-content:publish",
      versionId,
      `/api/public-content/admin/versions/${encodeURIComponent(versionId)}/publish`,
    );
  },
  archivePage(userId: number, id: string, motivo: string) {
    return mutate<AdminPublicPage>(
      userId,
      "public-content:archive-page",
      id,
      `/api/public-content/admin/pages/${encodeURIComponent(id)}/archive`,
      { motivo },
    );
  },
  classifyAsset(archivoId: string) {
    return apiRequest<ApiEnvelope<PublicAsset>>(
      "/api/public-content/admin/assets",
      body({ archivoId }),
    ).then((result) => result.data);
  },
  archiveAsset(id: string, motivo: string) {
    return apiRequest<ApiEnvelope<PublicAsset>>(
      `/api/public-content/admin/assets/${encodeURIComponent(id)}/archive`,
      body({ motivo }),
    ).then((result) => result.data);
  },
};
