/** A sampling budget is not a product deadline. Invariants are checked on every
 * sample (never retried away); callers must classify incomplete observations. */
export async function observe<T>(options: {
  read: () => Promise<T>;
  invariant: (value: T) => void | Promise<void>;
  complete: (value: T) => boolean;
  durationMs: number;
  intervalMs?: number;
}): Promise<{ complete: boolean; last: T; samples: number; elapsedMs: number }> {
  if (!Number.isFinite(options.durationMs) || options.durationMs < 0)
    throw new Error('Observation duration must be a finite nonnegative number');
  const start = performance.now();
  let samples = 0;
  for (;;) {
    const last = await options.read();
    samples++;
    await options.invariant(last);
    const elapsedMs = performance.now() - start;
    if (options.complete(last)) return { complete: true, last, samples, elapsedMs };
    if (elapsedMs >= options.durationMs) return { complete: false, last, samples, elapsedMs };
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(options.intervalMs ?? 50, options.durationMs - elapsedMs)),
    );
  }
}
