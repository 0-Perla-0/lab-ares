import type { Metadata } from "next";
import { PublicContentAdminPage } from "@/components/backend2/public-content/public-content-admin-page";

export const metadata: Metadata = { title: "Contenido público" };

export default function PublicContentAdminRoute() {
  return <PublicContentAdminPage />;
}
