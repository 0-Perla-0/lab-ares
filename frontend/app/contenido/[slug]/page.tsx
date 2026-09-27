import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicContentPage } from "@/components/backend2/public-content/public-content-page";
import { publicPageSlugs } from "@/lib/backend2/public-content";

export const metadata: Metadata = { title: "Información institucional" };

export default async function PublicContentRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!publicPageSlugs.includes(slug as (typeof publicPageSlugs)[number])) {
    notFound();
  }
  return <PublicContentPage slug={slug} />;
}
