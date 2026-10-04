import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AuthUser, fetchCurrentUser, logout as apiLogout, onSessionEnded } from "../api.js";

// Lab 3, Issue 3 — who is signed in (api-spec.md §1.2).
//
// The session itself is an HttpOnly cookie the browser holds; this context only
// mirrors the user the server says it belongs to. The server is the authority:
// hiding something here is never what protects it (BR-27).

export type AuthStatus = "loading" | "ready";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  /** True once the server has ended a session this browser was using (Issue 4, AC-08). */
  sessionEnded: boolean;
  setUser: (user: AuthUser | null) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

// Without a provider (e.g. tests that render screens on their own) nobody is
// signed in and nothing is fetched, so the Lab 2 screens behave as before.
const SIGNED_OUT: AuthContextValue = {
  user: null,
  status: "ready",
  sessionEnded: false,
  setUser: () => {},
  refresh: async () => {},
  signOut: async () => {},
};

const AuthContext = createContext<AuthContextValue>(SIGNED_OUT);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [sessionEnded, setSessionEnded] = useState(false);
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;

  // Signing in (a user arrives) clears any earlier "session ended" notice.
  const setUser = useCallback((next: AuthUser | null) => {
    setUserState(next);
    if (next) setSessionEnded(false);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUser(await fetchCurrentUser());
    } catch {
      // The server is unreachable or failed: treat as signed out rather than
      // crash; the next request that needs a session will say so.
      setUser(null);
    } finally {
      setStatus("ready");
    }
  }, [setUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Issue 4 — any request answered 401 while someone is signed in ends the
  // session here too; the route guards then show Login with the notice.
  useEffect(
    () =>
      onSessionEnded(() => {
        if (!userRef.current) return;
        setUserState(null);
        setSessionEnded(true);
      }),
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      // Even if the request failed, forget the user locally; the cookie is
      // HttpOnly and the server deletes the session on the next successful call.
      setUserState(null);
      setSessionEnded(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, sessionEnded, setUser, refresh, signOut }),
    [user, status, sessionEnded, setUser, refresh, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
