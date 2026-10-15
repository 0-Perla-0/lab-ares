import type { Metadata } from "next";
import { AbsencesPage } from "@/components/portal/absences-page";
export const metadata: Metadata = { title: "Ausencias y justificaciones" };
export default function AbsencesRoute() {
  return <AbsencesPage />;
}
