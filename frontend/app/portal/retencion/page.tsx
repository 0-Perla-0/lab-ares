import type { Metadata } from "next";
import { RetentionPage } from "@/components/backend2/retention/retention-page";

export const metadata: Metadata = { title: "Retención y supresión" };

export default function RetentionRoute() {
  return <RetentionPage />;
}
