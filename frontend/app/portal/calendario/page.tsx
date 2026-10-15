import type { Metadata } from "next";
import { CalendarPage } from "@/components/portal/calendar-page";
export const metadata: Metadata = { title: "Calendario" };
export default function CalendarRoute() {
  return <CalendarPage />;
}
