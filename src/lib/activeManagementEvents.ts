const listeners = new Set<() => void>();

export function notifyActiveManagementChanged() {
  for (const listener of listeners) listener();
}

export function subscribeActiveManagement(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
