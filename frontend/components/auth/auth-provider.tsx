"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { LoadingTable, Skeleton } from "@/components/ui/primitives";
import { ApiError, apiRequest, getApiErrorMessage } from "@/lib/api";
import type { ApiEnvelope, AuthUser } from "@/lib/types";
import { ReauthenticationDialog } from "./reauthentication-dialog";
import { SessionExpirationWarning } from "./session-expiration-warning";

type AuthContextValue = {
  user: AuthUser;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadUser() {
    setError("");
    setLoading(true);

    try {
      const response = await apiRequest<ApiEnvelope<AuthUser>>("/api/auth/me");
      setUser(response.data);
    } catch (requestError) {
      setUser(null);
      if (requestError instanceof ApiError && requestError.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handleUnauthorized = () => {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    };
    window.addEventListener("ares:unauthorized", handleUnauthorized);
    void loadUser();
    return () => {
      window.removeEventListener("ares:unauthorized", handleUnauthorized);
    };
    // Authentication is revalidated when the protected shell is mounted.
  }, []);

  const value = useMemo(
    () => (user ? { user, refreshUser: loadUser } : null),
    [user],
  );

  if (loading) return <PortalSkeleton />;

  if (error || !value) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--color-surface-inset)] px-5">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-bold">No pudimos abrir el portal</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void loadUser()}
            className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] px-5 py-3 text-sm font-bold text-[var(--color-on-primary)]"
          >
            <RefreshCw size={16} /> Reintentar
          </button>
        </div>
      </main>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      <ReauthenticationDialog />
      <SessionExpirationWarning />
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

// Silueta del portal (barra lateral, cabecera y contenido) mientras se valida la sesión.
function PortalSkeleton() {
  return (
    <div className="portal-background min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="hidden h-screen flex-col gap-3 border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-5 lg:flex">
        <Skeleton className="mb-4 h-12 w-40" />
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-full" />
        ))}
        <Skeleton className="mt-auto h-24 w-full rounded-[var(--radius-card)]" />
      </aside>
      <div className="min-w-0">
        <div className="flex min-h-17 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-canvas)] px-4 sm:px-7 lg:hidden">
          <Skeleton className="h-11 w-11 rounded-full" />
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
        <main className="mx-auto w-full max-w-[92rem] space-y-6 px-4 py-7 sm:px-7 sm:py-9 lg:px-10">
          <div className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-64 max-w-full" />
          </div>
          <LoadingTable label="Preparando tu espacio…" />
        </main>
      </div>
    </div>
  );
}
