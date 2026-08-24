"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";

import { ApiError, apiRequest, getApiErrorMessage } from "@/lib/api";
import type { ApiEnvelope, AuthUser } from "@/lib/types";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => (user ? { user, refreshUser: loadUser } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user],
  );

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f0e7]">
        <div className="text-center">
          <LoaderCircle
            className="mx-auto animate-spin text-[#769a27]"
            size={30}
          />
          <p className="mt-4 text-sm font-bold text-[#66736d]">
            Preparando tu espacio…
          </p>
        </div>
      </main>
    );
  }

  if (error || !value) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f0e7] px-5">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-black">No pudimos abrir el portal</h1>
          <p className="mt-3 text-sm leading-6 text-[#66736d]">{error}</p>
          <button
            type="button"
            onClick={() => void loadUser()}
            className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-[#12221b] px-5 py-3 text-sm font-black text-white"
          >
            <RefreshCw size={16} /> Reintentar
          </button>
        </div>
      </main>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
