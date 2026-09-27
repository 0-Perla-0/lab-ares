import {
  hasAnyPermission,
  permissions,
  type Permission,
} from "@/lib/permissions";
import type { AuthUser } from "@/lib/types";

export type Backend2NavigationItem = {
  href: string;
  label: string;
  description: string;
  icon:
    | "academic"
    | "documents"
    | "directory"
    | "kairos"
    | "reports"
    | "library"
    | "cms"
    | "gamification"
    | "printing"
    | "retention";
  requiredAny: readonly Permission[];
};

export type Backend2NavigationGroup = {
  label: string;
  items: readonly Backend2NavigationItem[];
};

export const backend2NavigationGroups: readonly Backend2NavigationGroup[] = [
  {
    label: "Personas y trayectoria",
    items: [
      {
        href: "/portal/directorio",
        label: "Directorio",
        description: "Consulta personas, sedes y áreas dentro de tu alcance.",
        icon: "directory",
        requiredAny: [permissions.DIRECTORY_READ],
      },
      {
        href: "/portal/perfil-academico",
        label: "Perfil académico",
        description: "Gestiona adscripciones y catálogos académicos.",
        icon: "academic",
        requiredAny: [
          permissions.ACADEMIC_PROFILE_READ,
          permissions.ACADEMIC_PROFILE_UPDATE,
          permissions.ACADEMIC_CATALOG_MANAGE,
        ],
      },
      {
        href: "/portal/expediente",
        label: "Documentos",
        description: "Carga, consulta y revisa el expediente documental.",
        icon: "documents",
        requiredAny: [
          permissions.DOCUMENTS_READ,
          permissions.DOCUMENTS_UPLOAD,
          permissions.DOCUMENTS_REVIEW,
        ],
      },
      {
        href: "/portal/kairos",
        label: "Kairós",
        description: "Administra proyectos, actividades y evidencias.",
        icon: "kairos",
        requiredAny: [permissions.KAIROS_PROJECT_CREATE],
      },
    ],
  },
  {
    label: "Conocimiento y resultados",
    items: [
      {
        href: "/portal/reportes",
        label: "Reportes",
        description: "Consulta métricas y genera exportaciones autorizadas.",
        icon: "reports",
        requiredAny: [permissions.REPORTS_READ, permissions.REPORTS_EXPORT],
      },
      {
        href: "/portal/biblioteca",
        label: "Biblioteca",
        description: "Publica y consulta recursos de conocimiento.",
        icon: "library",
        requiredAny: [
          permissions.LIBRARY_READ,
          permissions.LIBRARY_DRAFT_CREATE,
          permissions.LIBRARY_REVIEW,
          permissions.LIBRARY_PUBLISH,
          permissions.LIBRARY_ARCHIVE,
          permissions.LIBRARY_ACKNOWLEDGE,
        ],
      },
      {
        href: "/portal/contenido",
        label: "Contenido público",
        description:
          "Prepara y publica noticias, recursos y secciones públicas.",
        icon: "cms",
        requiredAny: [
          permissions.CMS_DRAFT,
          permissions.CMS_PUBLISH,
          permissions.CMS_ARCHIVE,
        ],
      },
      {
        href: "/portal/gamificacion",
        label: "Gamificación",
        description: "Consulta progreso, insignias y reglas de reconocimiento.",
        icon: "gamification",
        requiredAny: [
          permissions.GAMIFICATION_READ,
          permissions.GAMIFICATION_MANAGE,
        ],
      },
    ],
  },
  {
    label: "Servicios y gobierno",
    items: [
      {
        href: "/portal/impresion-3d",
        label: "Impresión 3D",
        description: "Solicita y da seguimiento a trabajos de impresión.",
        icon: "printing",
        requiredAny: [
          permissions.PRINTING_3D_REQUEST,
          permissions.PRINTING_3D_OPERATE,
          permissions.PRINTING_3D_MANAGE,
        ],
      },
      {
        href: "/portal/retencion",
        label: "Retención y supresión",
        description: "Gestiona solicitudes y políticas según tu alcance.",
        icon: "retention",
        requiredAny: [
          permissions.RETENTION_REQUEST,
          permissions.RETENTION_READ,
          permissions.RETENTION_MANAGE,
          permissions.RETENTION_EXECUTE,
        ],
      },
    ],
  },
] as const;

export function visibleBackend2Navigation(user: AuthUser | null | undefined) {
  return backend2NavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        hasAnyPermission(user, item.requiredAny),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
