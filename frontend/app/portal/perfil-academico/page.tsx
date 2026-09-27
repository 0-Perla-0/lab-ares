import type { Metadata } from "next";
import { AcademicPage } from "@/components/backend2/academic/academic-page";

export const metadata: Metadata = { title: "Perfil académico" };

export default function AcademicRoute() {
  return <AcademicPage />;
}
