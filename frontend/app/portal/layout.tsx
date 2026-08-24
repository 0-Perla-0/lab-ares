import { AuthProvider } from "@/components/auth/auth-provider";
import { PortalShell } from "@/components/portal/portal-shell";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <PortalShell>{children}</PortalShell>
    </AuthProvider>
  );
}
