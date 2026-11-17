import { describe, expect, it } from "vitest";
import { BulkQueue, type QueueSnapshot } from "@/lib/bulkQueue";

const tick = () => new Promise((r) => setTimeout(r, 0));
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const waitFor = async (cond: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("timeout");
    await tick();
  }
};

describe("BulkQueue", () => {
  it("processes all items once, de-duplicated", async () => {
    const seen: string[] = [];
    const q = new BulkQueue<string>({ worker: async (u) => (seen.push(u), u), delayMs: 0, concurrency: 3 });
    expect(q.add(["a", "b", "A", "c", "b ", ""])).toBe(3);
    q.start();
    await waitFor(() => q.snapshot().state === "done");
    expect(seen.sort()).toEqual(["a", "b", "c"]);
    expect(q.snapshot()).toMatchObject({ total: 3, completed: 3, pending: 0 });
  });

  it("respects concurrency", async () => {
    let active = 0;
    let peak = 0;
    const q = new BulkQueue<void>({
      concurrency: 2,
      delayMs: 0,
      worker: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      },
    });
    q.add(["a", "b", "c", "d", "e", "f"]);
    q.start();
    await waitFor(() => q.snapshot().state === "done");
    expect(peak).toBe(2);
  });

  it("pauses and resumes", async () => {
    const gates = new Map<string, ReturnType<typeof deferred<void>>>();
    const started: string[] = [];
    const q = new BulkQueue<void>({
      concurrency: 1,
      delayMs: 0,
      worker: (u) => {
        started.push(u);
        const d = deferred<void>();
        gates.set(u, d);
        return d.promise;
      },
    });
    q.add(["a", "b", "c"]);
    q.start();
    await waitFor(() => started.length === 1);
    q.pause();
    gates.get("a")!.resolve();
    await tick();
    await tick();
    expect(started).toEqual(["a"]);
    expect(q.snapshot().state).toBe("paused");
    q.resume();
    await waitFor(() => started.length === 2);
    gates.get("b")!.resolve();
    await waitFor(() => started.length === 3);
    gates.get("c")!.resolve();
    await waitFor(() => q.snapshot().state === "done");
    expect(q.snapshot().completed).toBe(3);
  });

  it("stop drops pending items and aborts in-flight work", async () => {
    let aborted = false;
    const results: string[] = [];
    const q = new BulkQueue<string>({
      concurrency: 1,
      delayMs: 0,
      worker: (u, signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve(u);
          });
        }),
      onResult: (u) => results.push(u),
    });
    q.add(["a", "b"]);
    q.start();
    await tick();
    q.stop();
    await tick();
    expect(aborted).toBe(true);
    expect(results).toEqual([]);
    expect(q.snapshot()).toMatchObject({ state: "stopped", pending: 0 });
  });

  it("applies delay between requests and back-off", async () => {
    const sleeps: number[] = [];
    const q = new BulkQueue<number>({
      concurrency: 1,
      delayMs: 250,
      worker: async () => 0,
      backoffFor: () => 0,
      sleep: async (ms) => void sleeps.push(ms),
    });
    q.add(["a", "b", "c"]);
    q.start();
    await waitFor(() => q.snapshot().state === "done");
    expect(sleeps).toEqual([250, 250]);
  });

  it("reports progress snapshots", async () => {
    const snaps: QueueSnapshot[] = [];
    const q = new BulkQueue<void>({ worker: async () => {}, delayMs: 0, onChange: (s) => snaps.push(s) });
    q.add(["a", "b"]);
    q.start();
    await waitFor(() => q.snapshot().state === "done");
    expect(snaps.at(-1)).toMatchObject({ state: "done", completed: 2, total: 2 });
  });

  it("reports worker errors without stopping", async () => {
    const errors: string[] = [];
    const q = new BulkQueue<void>({
      delayMs: 0,
      worker: async (u) => {
        if (u === "b") throw new Error("boom");
      },
      onError: (u) => errors.push(u),
    });
    q.add(["a", "b", "c"]);
    q.start();
    await waitFor(() => q.snapshot().state === "done");
    expect(errors).toEqual(["b"]);
    expect(q.snapshot().completed).toBe(3);
  });
});
