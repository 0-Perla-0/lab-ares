import type { Metadata } from "next";
import { GamificationPage } from "@/components/backend2/gamification/gamification-page";

export const metadata: Metadata = { title: "Gamificación" };
export default function Page() {
  return <GamificationPage />;
}
