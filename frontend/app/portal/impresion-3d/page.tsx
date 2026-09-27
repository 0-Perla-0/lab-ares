import type { Metadata } from "next";
import { Printing3dPage } from "@/components/backend2/printing-3d/printing-3d-page";

export const metadata: Metadata = { title: "Impresión 3D" };

export default function Printing3dRoute() {
  return <Printing3dPage />;
}
