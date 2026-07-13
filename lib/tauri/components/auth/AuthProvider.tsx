"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ensureValidAccessToken,
  getCurrentUserDisplayName,
  getCurrentUserEmail,
  restoreSession,
  signIn,
  signOut,
  signUp,
} from "@tauri/auth/oauth";
import type { AuthUserInfo } from "@tauri/auth/types";

interface AuthContextValue {
  initialized: boolean;
  authenticated: boolean;
  userName: string | null;
  userEmail: string | null;
  signIn: (loginHint?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const REFRESH_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncFromUser = useCallback((nextUser: AuthUserInfo | null, isAuthenticated: boolean) => {
    setAuthenticated(isAuthenticated);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    let cancelled = false;

    restoreSession()
      .then(({ tokens, user: restoredUser }) => {
        if (cancelled) return;
        syncFromUser(restoredUser, Boolean(tokens?.accessToken));
        setInitialized(true);
      })
      .catch((error) => {
        console.error("Failed to restore auth session", error);
        if (!cancelled) {
          syncFromUser(null, false);
          setInitialized(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [syncFromUser]);

  useEffect(() => {
    if (!authenticated) {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    refreshTimerRef.current = setInterval(() => {
      ensureValidAccessToken().catch((error) => {
        console.error("Background token refresh failed", error);
        syncFromUser(null, false);
      });
    }, REFRESH_CHECK_INTERVAL_MS);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [authenticated, syncFromUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized,
      authenticated,
      userName: getCurrentUserDisplayName(user),
      userEmail: getCurrentUserEmail(user),
      signIn: async (loginHint?: string) => {
        await signIn(loginHint ? { loginHint } : undefined);
        const session = await restoreSession();
        syncFromUser(session.user, Boolean(session.tokens?.accessToken));
      },
      signInWithGoogle: async () => {
        await signIn({ idpHint: "google" });
        const session = await restoreSession();
        syncFromUser(session.user, Boolean(session.tokens?.accessToken));
      },
      signUp: async () => {
        await signUp();
        const session = await restoreSession();
        syncFromUser(session.user, Boolean(session.tokens?.accessToken));
      },
      signOut: async () => {
        await signOut();
        syncFromUser(null, false);
      },
    }),
    [authenticated, initialized, syncFromUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
