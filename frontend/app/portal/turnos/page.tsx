import type { Metadata } from "next";

import { TurnosPage } from "@/components/portal/turnos-page";

export const metadata: Metadata = { title: "Turnos" };

export default function Page() {
  return <TurnosPage />;
}
