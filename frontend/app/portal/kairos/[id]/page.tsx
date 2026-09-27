import type { Metadata } from "next";
import { KairosProjectDetailPage } from "@/components/backend2/kairos/project-detail-page";

export const metadata: Metadata = { title: "Proyecto Kairós" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KairosProjectDetailPage projectId={id} />;
}
