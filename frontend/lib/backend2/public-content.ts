import { apiRequest } from "@/lib/api";
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
  createPage(input: PublicPageVersionInput & { slug: PublicPageSlug }) {
    return apiRequest<ApiEnvelope<AdminPublicPage>>(
      "/api/public-content/admin/pages",
      body(input),
    ).then((result) => result.data);
  },
  createVersion(id: string, input: PublicPageVersionInput) {
    return apiRequest<ApiEnvelope<AdminPublicVersion>>(
      `/api/public-content/admin/pages/${encodeURIComponent(id)}/versions`,
      body(input),
    ).then((result) => result.data);
  },
  publish(versionId: string) {
    return apiRequest<ApiEnvelope<AdminPublicVersion>>(
      `/api/public-content/admin/versions/${encodeURIComponent(versionId)}/publish`,
      body(),
    ).then((result) => result.data);
  },
  archivePage(id: string, motivo: string) {
    return apiRequest<ApiEnvelope<AdminPublicPage>>(
      `/api/public-content/admin/pages/${encodeURIComponent(id)}/archive`,
      body({ motivo }),
    ).then((result) => result.data);
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
