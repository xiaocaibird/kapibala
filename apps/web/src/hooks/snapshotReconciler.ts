interface SnapshotCallbacks<T> {
  load: (signal: AbortSignal) => Promise<T>;
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  onSyncing: (syncing: boolean) => void;
}

// A consumed event remains dirty until a complete snapshot succeeds. Retry delay is
// capped, not the number of attempts: recovery must not require another WS event.
export function createSnapshotReconciler<T>(callbacks: SnapshotCallbacks<T>) {
  let dirty = false;
  let disposed = false;
  let active: Promise<void> | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 250;
  const controller = new AbortController();

  const drain = async (): Promise<void> => {
    callbacks.onSyncing(true);
    try {
      while (dirty && !disposed) {
        dirty = false;
        try {
          const value = await callbacks.load(controller.signal);
          if (disposed) return;
          callbacks.onValue(value);
          retryDelay = 250;
        } catch (error) {
          if (disposed) return;
          dirty = true;
          callbacks.onError(error);
          retry = setTimeout(() => {
            retry = undefined;
            void start();
          }, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 2000);
          return;
        }
      }
    } finally {
      if (!disposed) callbacks.onSyncing(false);
    }
  };
  const start = (): Promise<void> => {
    if (disposed || retry !== undefined) return Promise.resolve();
    if (active) return active;
    active = drain().finally(() => {
      active = null;
      // An event can arrive after drain's last dirty check but before this promise
      // releases its slot. Hand that event to a new pass before resolving callers.
      if (dirty && !disposed && retry === undefined) return start();
    });
    return active;
  };
  return {
    invalidate(): Promise<void> {
      if (disposed) return Promise.resolve();
      dirty = true;
      return start();
    },
    dispose(): void {
      disposed = true;
      dirty = false;
      clearTimeout(retry);
      controller.abort();
    },
  };
}
