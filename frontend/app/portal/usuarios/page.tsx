import type { Metadata } from "next";

import { UsersPage } from "@/components/portal/users-page";

export const metadata: Metadata = { title: "Usuarios" };

export default function Page() {
  return <UsersPage />;
}
