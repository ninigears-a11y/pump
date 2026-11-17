/**
 * Framework-agnostic bulk work queue with concurrency, inter-request delay,
 * pause/resume, stop, de-duplication and adaptive back-off.
 */
export type QueueState = "idle" | "running" | "paused" | "stopped" | "done";

export interface QueueSnapshot {
  state: QueueState;
  total: number;
  completed: number;
  active: number;
  pending: number;
}

export interface BulkQueueOptions<R> {
  worker: (item: string, signal: AbortSignal) => Promise<R>;
  concurrency?: number;
  delayMs?: number;
  onResult?: (item: string, result: R) => void;
  onError?: (item: string, error: unknown) => void;
  onChange?: (snap: QueueSnapshot) => void;
  /** Return ms to back off all workers after a result (e.g. rate limited). */
  backoffFor?: (result: R) => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const abortableSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });

export class BulkQueue<R> {
  private pending: string[] = [];
  private seen = new Set<string>();
  private active = 0;
  private completed = 0;
  private state: QueueState = "idle";
  private controller = new AbortController();
  private backoffUntil = 0;
  private resumeWaiters: (() => void)[] = [];
  private workers = 0;
  concurrency: number;
  delayMs: number;

  constructor(private readonly opts: BulkQueueOptions<R>) {
    this.concurrency = clampInt(opts.concurrency ?? 3, 1, 20);
    this.delayMs = Math.max(0, opts.delayMs ?? 500);
  }

  /** Add items, skipping duplicates. Returns the number actually added. */
  add(items: string[]): number {
    let added = 0;
    for (const raw of items) {
      const it = raw.trim().toLowerCase();
      if (!it || this.seen.has(it)) continue;
      this.seen.add(it);
      this.pending.push(it);
      added++;
    }
    if (added && this.state === "done") this.state = "idle";
    this.emit();
    if (this.state === "running") this.spawn();
    return added;
  }

  snapshot(): QueueSnapshot {
    return {
      state: this.state,
      total: this.seen.size,
      completed: this.completed,
      active: this.active,
      pending: this.pending.length,
    };
  }

  start(): void {
    if (this.state === "running") return;
    if (this.state === "stopped") this.controller = new AbortController();
    this.state = "running";
    this.emit();
    this.wakeAll();
    this.spawn();
    this.maybeDone();
  }

  pause(): void {
    if (this.state !== "running") return;
    this.state = "paused";
    this.emit();
  }

  resume(): void {
    if (this.state === "paused") this.start();
  }

  /** Stop and drop remaining items. In-flight requests are aborted. */
  stop(): void {
    this.state = "stopped";
    this.pending = [];
    this.controller.abort();
    this.wakeAll();
    this.emit();
  }

  setConcurrency(n: number): void {
    this.concurrency = clampInt(n, 1, 20);
    if (this.state === "running") this.spawn();
  }

  setDelay(ms: number): void {
    this.delayMs = Math.max(0, ms);
  }

  private spawn() {
    while (this.workers < this.concurrency && this.pending.length > 0) {
      this.workers++;
      void this.loop();
    }
  }

  private async loop(): Promise<void> {
    const sleep = this.opts.sleep ?? abortableSleep;
    try {
      while (true) {
        if (this.state === "paused") await new Promise<void>((r) => this.resumeWaiters.push(r));
        if (this.state !== "running") return;
        if (this.workers > this.concurrency) return; // concurrency lowered
        const wait = this.backoffUntil - Date.now();
        if (wait > 0) await sleep(wait, this.controller.signal);
        if (this.state !== "running") {
          if (this.state === "paused") continue;
          return;
        }
        const item = this.pending.shift();
        if (item === undefined) return;
        this.active++;
        this.emit();
        const signal = this.controller.signal;
        try {
          const result = await this.opts.worker(item, signal);
          if (!signal.aborted) {
            this.opts.onResult?.(item, result);
            const backoff = this.opts.backoffFor?.(result) ?? 0;
            if (backoff > 0) this.backoffUntil = Math.max(this.backoffUntil, Date.now() + backoff);
          }
        } catch (err) {
          if (!signal.aborted) this.opts.onError?.(item, err);
        } finally {
          this.active--;
          if (!signal.aborted) this.completed++;
          this.emit();
        }
        if (this.pending.length > 0) await sleep(this.delayMs, this.controller.signal);
      }
    } finally {
      this.workers--;
      this.maybeDone();
    }
  }

  private maybeDone() {
    if (this.state === "running" && this.pending.length === 0 && this.active === 0 && this.workers === 0) {
      this.state = "done";
      this.emit();
    }
  }

  private wakeAll() {
    const w = this.resumeWaiters;
    this.resumeWaiters = [];
    w.forEach((r) => r());
  }

  private emit() {
    this.opts.onChange?.(this.snapshot());
  }
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number.isFinite(n) ? n : min)));
}
