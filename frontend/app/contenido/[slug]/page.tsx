import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicContentPage } from "@/components/backend2/public-content/public-content-page";
import { publicPageSlugs } from "@/lib/backend2/public-content";
import { fetchPublishedPage } from "@/lib/backend2/public-content-server";

type Params = { params: Promise<{ slug: string }> };

const isKnownSlug = (slug: string) =>
  publicPageSlugs.includes(slug as (typeof publicPageSlugs)[number]);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const fallback: Metadata = { title: "Información institucional" };
  if (!isKnownSlug(slug)) return fallback;
  const page = await fetchPublishedPage(slug);
  if (!page) return fallback;
  return {
    title: page.metadata.seoTitulo || page.titulo,
    description: page.metadata.seoDescripcion || undefined,
    alternates: { canonical: `/contenido/${slug}` },
  };
}

export default async function PublicContentRoute({ params }: Params) {
  const { slug } = await params;
  if (!isKnownSlug(slug)) notFound();
  return <PublicContentPage slug={slug} />;
}
