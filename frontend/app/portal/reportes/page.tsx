import type { Metadata } from "next";
import { ReportsPage } from "@/components/backend2/reports/reports-page";

export const metadata: Metadata = { title: "Reportes" };

export default function ReportsRoute() {
  return <ReportsPage />;
}
