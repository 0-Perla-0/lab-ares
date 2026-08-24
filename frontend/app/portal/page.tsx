import type { Metadata } from "next";

import { DashboardPage } from "@/components/portal/dashboard-page";

export const metadata: Metadata = { title: "Resumen" };

export default function PortalPage() {
  return <DashboardPage />;
}
