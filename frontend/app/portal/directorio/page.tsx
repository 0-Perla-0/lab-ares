import type { Metadata } from "next";
import { DirectoryPage } from "@/components/backend2/directory/directory-page";

export const metadata: Metadata = { title: "Directorio" };

export default function DirectoryRoute() {
  return <DirectoryPage />;
}
