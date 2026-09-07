"use client";

/**
 * VoltSentry NOC — client-side access gate.
 *
 * This is a DEMO gate, not real security: it tracks an `isAuthenticated` flag in
 * localStorage so the NOC dashboard, 3D twin and other internal pages redirect
 * unauthenticated visitors to `/login`. There is no backend, no password check,
 * no token verification — consistent with the localhost-only, no-auth posture of
 * the rest of the project. It exists to frame the demo, not to protect anything.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";

export interface Operator {
  name: string;
  employeeId: string;
  email: string;
}

interface AuthContextValue {
  operator: Operator | null;
  isAuthenticated: boolean;
  /** True once localStorage has been read — guards against a redirect flash. */
  hydrated: boolean;
  login: (operator: Operator) => void;
  logout: () => void;
}

const STORAGE_KEY = "voltsentry.operator";
const LOGIN_ROUTE = "/login";

const AuthContext = createContext<AuthContextValue | null>(null);

function readStored(): Operator | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Operator>;
    if (parsed && parsed.name && parsed.employeeId && parsed.email) {
      return { name: parsed.name, employeeId: parsed.employeeId, email: parsed.email };
    }
  } catch {
    /* corrupt entry — treat as logged out */
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [operator, setOperator] = useState<Operator | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOperator(readStored());
    setHydrated(true);
  }, []);

  const login = useCallback((next: Operator) => {
    setOperator(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage disabled — session stays in memory only */
    }
  }, []);

  const logout = useCallback(() => {
    setOperator(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      operator,
      isAuthenticated: operator !== null,
      hydrated,
      login,
      logout,
    }),
    [operator, hydrated, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}

/**
 * Gatekeeper. Wrap any protected page's content in this. An unauthenticated
 * visitor is redirected to /login; nothing protected renders in the meantime.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (hydrated && !isAuthenticated && pathname !== LOGIN_ROUTE) {
      router.replace(LOGIN_ROUTE);
    }
  }, [hydrated, isAuthenticated, pathname, router]);

  if (!hydrated || !isAuthenticated) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-volt-bg">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-volt-green/30 border-t-volt-green" />
        <p className="font-mono text-[11px] uppercase tracking-widest text-volt-muted">
          Verifying security clearance…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
