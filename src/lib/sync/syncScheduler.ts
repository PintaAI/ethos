export type SyncTrigger = "manual" | "mutation" | "automatic";
export type SyncRetry = { retry: boolean; retryAfterMs?: number; blockAutomatic?: boolean };

type SchedulerOptions = {
  run: (signal: AbortSignal) => Promise<SyncRetry>;
  onError?: (error: unknown) => void;
  debounceMs?: number;
  now?: () => number;
  random?: () => number;
  schedule?: (task: () => void, delayMs: number) => () => void;
};

export function createSyncScheduler(options: SchedulerOptions) {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const schedule = options.schedule ?? ((task, delay) => {
    const timer = setTimeout(task, delay);
    return () => clearTimeout(timer);
  });
  let active = true;
  let online = true;
  let disposed = false;
  let pending = false;
  let pendingManual = false;
  let automaticBlocked = false;
  let failures = 0;
  let notBefore = 0;
  let serverNotBefore = 0;
  let cancelTimer: (() => void) | null = null;
  let running: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let waiters: (() => void)[] = [];

  function arm(delayMs = 0) {
    if (disposed || !active || !online || running || !pending || (automaticBlocked && !pendingManual)) return;
    cancelTimer?.();
    cancelTimer = schedule(start, Math.max(delayMs, notBefore - now(), 0));
  }

  function start() {
    cancelTimer = null;
    if (disposed || !active || !online || running || !pending || (automaticBlocked && !pendingManual)) return;
    pending = false;
    pendingManual = false;
    controller = new AbortController();
    const signal = controller.signal;
    const attemptWaiters = waiters;
    waiters = [];
    running = Promise.resolve().then(() => options.run(signal)).then((result) => {
      if (disposed) return;
      automaticBlocked = result.blockAutomatic === true;
      serverNotBefore = Math.max(serverNotBefore, now() + (result.retryAfterMs ?? 0));
      if (automaticBlocked && !pendingManual) {
        pending = false;
        waiters.forEach((resolve) => resolve()); waiters = [];
      }
      if (result.retry && !automaticBlocked) {
        failures += 1;
        const base = Math.min(15_000 * 2 ** Math.min(failures - 1, 6), 15 * 60_000);
        notBefore = Math.max(serverNotBefore, now() + Math.min(base + Math.floor(random() * base), 15 * 60_000));
        pending = true;
      } else {
        failures = 0;
        notBefore = serverNotBefore;
      }
    }).catch((error) => {
      if (!disposed) options.onError?.(error);
    }).finally(() => {
      running = null;
      controller = null;
      attemptWaiters.forEach((resolve) => resolve());
      if (disposed) return;
      // A mutation committed after collection needs another complete run.
      arm(options.debounceMs ?? 750);
    });
  }

  return {
    request(trigger: SyncTrigger = "automatic"): Promise<void> {
      if (disposed) return Promise.resolve();
      if (automaticBlocked && trigger !== "manual") return Promise.resolve();
      pending = true;
      if (trigger === "manual") { pendingManual = true; automaticBlocked = false; failures = 0; notBefore = serverNotBefore; }
      arm(trigger === "mutation" ? options.debounceMs ?? 750 : 0);
      if (!active || !online) return Promise.resolve();
      return new Promise<void>((resolve) => { waiters.push(resolve); });
    },
    setActive(value: boolean) {
      active = value;
      if (!active) {
        cancelTimer?.(); cancelTimer = null;
        waiters.forEach((resolve) => resolve()); waiters = [];
      }
      else arm();
    },
    setOnline(value: boolean) {
      const reconnected = !online && value;
      online = value;
      if (!online) {
        cancelTimer?.(); cancelTimer = null;
        waiters.forEach((resolve) => resolve()); waiters = [];
      }
      else {
        if (reconnected) { failures = 0; notBefore = serverNotBefore; }
        arm();
      }
    },
    async dispose(): Promise<void> {
      disposed = true;
      pending = false;
      cancelTimer?.();
      cancelTimer = null;
      controller?.abort(new Error("Sync scope stopped"));
      waiters.forEach((resolve) => resolve());
      waiters = [];
      await running;
    },
  };
}
