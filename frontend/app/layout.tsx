import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ares | Laboratorio de Inventores",
    template: "%s | Ares",
  },
  description:
    "Plataforma operativa para coordinar equipos, sedes, áreas y turnos del Laboratorio de Inventores.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#12221b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
