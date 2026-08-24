import type { Metadata } from "next";

import { AreasPage } from "@/components/portal/areas-page";

export const metadata: Metadata = { title: "Áreas" };

export default function Page() {
  return <AreasPage />;
}
