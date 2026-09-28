import { z } from "zod";

export const PUBLIC_PAGE_SLUGS = [
  "inicio",
  "servicio-social",
  "preguntas-frecuentes",
  "acerca-de-ares",
  "contacto",
  "informacion-legal",
] as const;

const noMarkup = (value: string) =>
  !/<\/?[a-z][^>]*>/i.test(value) && !/javascript\s*:/i.test(value);

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(noMarkup, "HTML_OR_SCRIPT_NOT_ALLOWED");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(noMarkup, "HTML_OR_SCRIPT_NOT_ALLOWED")
    .optional();

const safeLink = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  }, "UNSAFE_PUBLIC_LINK");

const baseBlock = z.object({ orden: z.number().int().min(0).max(999) });

export const publicContentBlockSchema = z.discriminatedUnion("tipo", [
  baseBlock
    .extend({
      tipo: z.literal("TEXTO"),
      contenido: z.object({ texto: text(10000) }).strict(),
    })
    .strict(),
  baseBlock
    .extend({
      tipo: z.literal("ENCABEZADO"),
      contenido: z
        .object({ texto: text(300), nivel: z.number().int().min(1).max(6) })
        .strict(),
    })
    .strict(),
  baseBlock
    .extend({
      tipo: z.literal("LISTA"),
      contenido: z
        .object({
          elementos: z.array(text(500)).min(1).max(50),
          ordenada: z.boolean().default(false),
        })
        .strict(),
    })
    .strict(),
  baseBlock
    .extend({
      tipo: z.literal("ENLACE"),
      contenido: z
        .object({
          etiqueta: text(200),
          url: safeLink,
          nuevaVentana: z.boolean().default(false),
        })
        .strict(),
    })
    .strict(),
  baseBlock
    .extend({
      tipo: z.literal("AVISO"),
      contenido: z
        .object({
          titulo: optionalText(200),
          texto: text(2000),
          tono: z
            .enum(["INFORMATIVO", "ADVERTENCIA", "EXITO"])
            .default("INFORMATIVO"),
        })
        .strict(),
    })
    .strict(),
  baseBlock
    .extend({
      tipo: z.literal("IMAGEN"),
      activoPublicoId: z.string().cuid(),
      contenido: z.object({ alt: text(300), pie: optionalText(500) }).strict(),
    })
    .strict(),
  baseBlock
    .extend({
      tipo: z.literal("FAQ"),
      contenido: z
        .object({ pregunta: text(500), respuesta: text(5000) })
        .strict(),
    })
    .strict(),
]);

const versionFields = {
  titulo: text(191),
  resumenCambios: text(2000),
  seoTitulo: optionalText(191),
  seoDescripcion: optionalText(500),
  bloques: z.array(publicContentBlockSchema).min(1).max(100),
};

function uniqueBlockOrder<T extends { orden: number }>(input: {
  bloques: T[];
}) {
  return (
    new Set(input.bloques.map((block) => block.orden)).size ===
    input.bloques.length
  );
}

export const createPublicPageSchema = z
  .object({ slug: z.enum(PUBLIC_PAGE_SLUGS), ...versionFields })
  .strict()
  .refine(uniqueBlockOrder, {
    message: "DUPLICATE_BLOCK_ORDER",
    path: ["bloques"],
  });

export const createPublicVersionSchema = z
  .object(versionFields)
  .strict()
  .refine(uniqueBlockOrder, {
    message: "DUPLICATE_BLOCK_ORDER",
    path: ["bloques"],
  });

export const listPublicPagesSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    estado: z.enum(["BORRADOR", "PUBLICADO", "ARCHIVADO"]).optional(),
  })
  .strict();

export const classifyPublicAssetSchema = z
  .object({ archivoId: z.string().cuid() })
  .strict();
export const archivePublicPageSchema = z
  .object({ motivo: text(1000) })
  .strict();
export const archivePublicAssetSchema = archivePublicPageSchema;

export type PublicContentBlockInput = z.infer<typeof publicContentBlockSchema>;
export type CreatePublicPageInput = z.infer<typeof createPublicPageSchema>;
export type CreatePublicVersionInput = z.infer<
  typeof createPublicVersionSchema
>;
export type ListPublicPagesInput = z.infer<typeof listPublicPagesSchema>;
export type ClassifyPublicAssetInput = z.infer<
  typeof classifyPublicAssetSchema
>;
