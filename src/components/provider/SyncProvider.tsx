import { createContext, useContext, type ReactNode } from "react";
import { useSync, type SyncHook } from "@/lib/sync/useSync";

const SyncContext = createContext<SyncHook | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const value = useSync();
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncStatus(): SyncHook {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSyncStatus must be used within SyncProvider");
  return value;
}