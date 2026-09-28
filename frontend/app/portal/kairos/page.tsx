import type { Metadata } from "next";
import { KairosProjectsPage } from "@/components/backend2/kairos/projects-page";

export const metadata: Metadata = { title: "Kairós" };
export default function Page() {
  return <KairosProjectsPage />;
}
