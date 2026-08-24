import type { Metadata } from "next";

import { UserEditorPage } from "@/components/portal/user-editor-page";

export const metadata: Metadata = { title: "Registrar usuario" };

export default function Page() {
  return <UserEditorPage mode="create" />;
}
