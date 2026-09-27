import type { Metadata } from "next";
import { LibraryPage } from "@/components/backend2/library/library-page";

export const metadata: Metadata = { title: "Biblioteca operativa" };

export default function LibraryRoute() {
  return <LibraryPage />;
}
