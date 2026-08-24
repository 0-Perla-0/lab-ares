import type { Metadata } from "next";

import { SedesPage } from "@/components/portal/sedes-page";

export const metadata: Metadata = { title: "Sedes" };

export default function Page() {
  return <SedesPage />;
}
