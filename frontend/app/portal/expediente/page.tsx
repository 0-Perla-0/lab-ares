import type { Metadata } from "next";
import { DocumentsPage } from "@/components/backend2/documents/documents-page";

export const metadata: Metadata = { title: "Expediente documental" };

export default function DocumentsRoute() {
  return <DocumentsPage />;
}
