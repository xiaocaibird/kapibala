import { ApiError } from "../api/client";

interface ResourceLoaderOptions<T> {
  load: (signal: AbortSignal) => Promise<T>;
  readGeneration: () => number;
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  onSettled: () => void;
}

const RETRY_DELAYS = [250, 500, 1000] as const;
function canRetry(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  // A malformed successful response is reported as 502 by the API client. It is
  // a contract failure, not a temporary gateway error. Never retry authentication
  // or validation failures, and leave 429 to the caller rather than ignoring a
  // server's rate-limit waiting period.
  if (
    ["INVALID_RESPONSE", "VALIDATION_ERROR", "SESSION_CHANGED"].includes(
      error.code,
    )
  )
    return false;
  return (
    (error.status === 0 && error.code === "NETWORK_ERROR") ||
    [408, 500, 502, 503, 504].includes(error.status)
  );
}

export function createResourceLoader<T>(options: ResourceLoaderOptions<T>) {
  let disposed = false;
  let active: Promise<void> | null = null;
  let pending = false;
  let cancelWait: (() => void) | undefined;
  const controller = new AbortController();
  const wait = (delay: number): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        cancelWait = undefined;
        resolve();
      }, delay);
      cancelWait = () => {
        clearTimeout(timer);
        cancelWait = undefined;
        resolve();
      };
    });

  const reload = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    // Polls, events and explicit refreshes share the request and its retry delay.
    if (active) {
      pending = true;
      return active;
    }
    const generation = options.readGeneration();
    const current = () => !disposed && options.readGeneration() === generation;
    const drain = async (): Promise<void> => {
      let retries = 0;
      do {
        pending = false;
        let delay: number | undefined;
        try {
          const value = await options.load(controller.signal);
          if (!current()) return;
          options.onValue(value);
          retries = 0;
        } catch (error) {
          if (!current()) return;
          if (error instanceof DOMException && error.name === "AbortError") {
            pending = false;
            return;
          }
          options.onError(error);
          delay = canRetry(error) ? RETRY_DELAYS[retries++] : undefined;
          if (delay === undefined) {
            // A later user action/event/poll may start another bounded attempt.
            // Invalidations consumed during this failure cannot extend its budget.
            pending = false;
            return;
          }
        } finally {
          if (current()) options.onSettled();
        }
        if (delay !== undefined) {
          await wait(delay);
          if (!current()) return;
          pending = true;
        }
      } while (pending && current());
    };
    active = drain().finally(() => {
      active = null;
      if (!current()) {
        pending = false;
        return;
      }
      // Keep an invalidation arriving at the final callback from being stranded.
      if (pending) return reload();
    });
    return active;
  };
  return {
    reload,
    dispose(): void {
      disposed = true;
      pending = false;
      controller.abort();
      cancelWait?.();
    },
  };
}
