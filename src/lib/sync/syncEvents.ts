import { withDbLock } from "./dbLock";

type SyncEvent = "mutation" | "stop";
const listeners = new Set<(event: SyncEvent) => void | Promise<void>>();

export function subscribeSyncEvents(listener: (event: SyncEvent) => void | Promise<void>) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifySyncMutation() {
  for (const listener of listeners) void Promise.resolve().then(() => listener("mutation")).catch((error) => console.warn("[sync] mutation trigger failed", error));
}

export async function withSyncMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = await withDbLock(operation);
  // Notify only after commit and lock release; subscribers never run network
  // operations inside the mutation's SQLite transaction.
  notifySyncMutation();
  return result;
}

export async function stopSyncRequests(): Promise<void> {
  await Promise.all([...listeners].map((listener) => listener("stop")));
}
