import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UserEditorPage } from "@/components/portal/user-editor-page";

export const metadata: Metadata = { title: "Editar usuario" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  return <UserEditorPage mode="edit" userId={Number(id)} />;
}
