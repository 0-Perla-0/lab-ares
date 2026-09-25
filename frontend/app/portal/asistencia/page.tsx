import type { Metadata } from "next";
import { AttendancePage } from "@/components/portal/attendance-page";

export const metadata: Metadata = { title: "Asistencia" };

export default function AttendanceRoute() {
  return <AttendancePage />;
}
