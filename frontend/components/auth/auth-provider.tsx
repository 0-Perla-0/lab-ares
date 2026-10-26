"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";

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

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--color-surface-inset)]">
        <div className="text-center">
          <LoaderCircle
            className="mx-auto animate-spin text-[var(--color-accent-text)]"
            size={30}
          />
          <p className="mt-4 text-sm font-bold text-[var(--color-muted)]">
            Preparando tu espacio…
          </p>
        </div>
      </main>
    );
  }

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
