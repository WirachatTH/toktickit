import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";
import { Requester } from "../api.js";

// Lab 2, Issue 4 — the selected Development Requester (BR-07, BR-08, BR-09).
// Deliberately NOT authentication: no token, no session, just an id/name/email
// the app trusts for testing purposes (BR-03, BR-47/48).

const STORAGE_KEY = "tokTickIT.devRequester";

interface RequesterContextValue {
  requester: Requester | null;
  selectRequester: (requester: Requester) => void;
  changeRequester: () => void;
}

const RequesterContext = createContext<RequesterContextValue | undefined>(undefined);

function readStoredRequester(): Requester | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "number" && typeof parsed.name === "string" && typeof parsed.email === "string") {
      return parsed as Requester;
    }
    return null;
  } catch {
    // Malformed JSON, or localStorage unavailable (private browsing, disabled
    // storage) — fail safe to "no Requester selected" rather than crash.
    return null;
  }
}

function writeStoredRequester(requester: Requester | null): void {
  try {
    if (requester) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requester));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Persistence failing (quota, private browsing) shouldn't block using
    // the app for the current session — selection still works in memory,
    // it just won't survive a refresh.
  }
}

// Read once, synchronously, at module scope: localStorage access is
// synchronous, so there is no loading flash and no separate "ready" state
// to coordinate — the very first render already has the right value.
export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<Requester | null>(() => readStoredRequester());

  const selectRequester = useCallback((next: Requester) => {
    writeStoredRequester(next);
    setRequester(next);
  }, []);

  const changeRequester = useCallback(() => {
    writeStoredRequester(null);
    setRequester(null);
  }, []);

  const value = useMemo(
    () => ({ requester, selectRequester, changeRequester }),
    [requester, selectRequester, changeRequester]
  );

  return <RequesterContext.Provider value={value}>{children}</RequesterContext.Provider>;
}

export function useRequester(): RequesterContextValue {
  const context = useContext(RequesterContext);
  if (!context) {
    throw new Error("useRequester must be used within a RequesterProvider");
  }
  return context;
}
