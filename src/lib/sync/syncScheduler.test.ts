// @ts-nocheck -- Executed directly by Bun's test runner.
import { describe, expect, test } from "bun:test";
import { createSyncScheduler, type SyncRetry } from "./syncScheduler";
import { syncRetryDecision } from "./syncPolicy";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function clock() {
  let time = 0;
  const jobs = new Set<{ at: number; task: () => void }>();
  return {
    now: () => time,
    random: () => 0,
    schedule: (task: () => void, delay: number) => {
      const job = { at: time + delay, task };
      jobs.add(job);
      return () => { jobs.delete(job); };
    },
    async advance(delay: number) {
      time += delay;
      for (let i = 0; i < 20; i++) {
        const due = [...jobs].filter((job) => job.at <= time);
        for (const job of due) { jobs.delete(job); job.task(); }
        await Promise.resolve();
      }
    },
  };
}

describe("sync scheduler", () => {
  test("debounces a burst and runs a follow-up for a mutation committed during upload", async () => {
    const timers = clock();
    const first = deferred<SyncRetry>();
    let calls = 0;
    const scheduler = createSyncScheduler({ ...timers, run: async () => {
      calls += 1;
      return calls === 1 ? first.promise : { retry: false };
    } });
    void scheduler.request("mutation");
    void scheduler.request("mutation");
    await timers.advance(749);
    expect(calls).toBe(0);
    await timers.advance(1);
    expect(calls).toBe(1);
    void scheduler.request("mutation");
    first.resolve({ retry: false });
    await timers.advance(0);
    await timers.advance(750);
    expect(calls).toBe(2);
    await scheduler.dispose();
  });

  test("retries transient failures with backoff and honors server Retry-After across reconnect", async () => {
    const timers = clock();
    let calls = 0;
    const scheduler = createSyncScheduler({ ...timers, run: async () => {
      calls += 1;
      return calls === 1 ? { retry: true, retryAfterMs: 60_000 } : { retry: false };
    } });
    void scheduler.request("manual");
    await timers.advance(0);
    scheduler.setOnline(false);
    scheduler.setOnline(true);
    void scheduler.request("mutation");
    await timers.advance(59_999);
    expect(calls).toBe(1);
    await timers.advance(1);
    expect(calls).toBe(2);
    await scheduler.dispose();
  });

  test("keeps offline work for reconnect and pauses timers in the background", async () => {
    const timers = clock();
    let calls = 0;
    const scheduler = createSyncScheduler({ ...timers, run: async () => { calls += 1; return { retry: false }; } });
    scheduler.setOnline(false);
    await scheduler.request("mutation");
    await timers.advance(10_000);
    expect(calls).toBe(0);
    scheduler.setOnline(true);
    scheduler.setActive(false);
    await timers.advance(10_000);
    expect(calls).toBe(0);
    scheduler.setActive(true);
    await timers.advance(0);
    expect(calls).toBe(1);
    await scheduler.dispose();
  });

  test("scope disposal aborts the active attempt and waits for it, discarding follow-ups", async () => {
    const timers = clock();
    const gate = deferred<SyncRetry>();
    let calls = 0;
    let receivedSignal: AbortSignal | null = null;
    const scheduler = createSyncScheduler({ ...timers, run: async (signal) => {
      receivedSignal = signal;
      calls += 1;
      return gate.promise;
    } });
    void scheduler.request("manual");
    await timers.advance(0);
    void scheduler.request("mutation");
    let disposed = false;
    const stopping = scheduler.dispose().then(() => { disposed = true; });
    await timers.advance(0);
    expect(receivedSignal?.aborted).toBe(true);
    expect(disposed).toBe(false);
    gate.resolve({ retry: true });
    await stopping;
    await timers.advance(100_000);
    expect(calls).toBe(1);
  });

  test("validation and authentication failures require action instead of automatic retry", () => {
    expect(syncRetryDecision({ status: 400 }).retry).toBe(false);
    expect(syncRetryDecision({ status: 401 }).retry).toBe(false);
    expect(syncRetryDecision({ status: 403 }).retry).toBe(false);
    expect(syncRetryDecision({ status: 429, retryAfterMs: 60_000 })).toEqual({ retry: true, retryAfterMs: 60_000 });
    expect(syncRetryDecision(new TypeError("Network request failed")).retry).toBe(true);
  });

  test("an uncertain non-idempotent create requires manual retry, including after reconnect or another edit", async () => {
    const timers = clock();
    const first = deferred<SyncRetry>();
    let calls = 0;
    const scheduler = createSyncScheduler({ ...timers, run: async () => {
      calls += 1;
      return calls === 1 ? first.promise : { retry: false };
    } });
    void scheduler.request("manual");
    await timers.advance(0);
    const followup = scheduler.request("mutation");
    first.resolve({ retry: true, blockAutomatic: true });
    await timers.advance(0);
    await followup;
    scheduler.setOnline(false);
    scheduler.setOnline(true);
    await scheduler.request("automatic");
    await scheduler.request("mutation");
    await timers.advance(60_000);
    expect(calls).toBe(1);
    const manual = scheduler.request("manual");
    await timers.advance(0);
    await manual;
    expect(calls).toBe(2);
    await scheduler.dispose();
  });
});
