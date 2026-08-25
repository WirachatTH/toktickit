import React, { createContext, useState, useContext, ReactNode } from "react";
import { RequesterUser } from "../api.js";

interface RequesterContextType {
  currentRequester: RequesterUser | null;
  setCurrentRequester: (requester: RequesterUser | null) => void;
}

export const RequesterContext = createContext<RequesterContextType | undefined>(undefined);

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [currentRequester, setCurrentRequester] = useState<RequesterUser | null>(null);

  return (
    <RequesterContext.Provider value={{ currentRequester, setCurrentRequester }}>
      {children}
    </RequesterContext.Provider>
  );
}

export function useRequester() {
  const context = useContext(RequesterContext);
  if (context === undefined) {
    throw new Error("useRequester must be used within a RequesterProvider");
  }
  return context;
}
