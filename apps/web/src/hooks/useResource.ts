import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { request } from "../api/client";
import { useLive } from "../state/live";
export function useResource<T>(
  path: string | null,
  schema: z.ZodType<T>,
  pollMs = 0,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const flight = useRef<Promise<void> | null>(null);
  const pending = useRef(false);
  const { revision } = useLive();
  const reload = useCallback((): Promise<void> => {
    if (!path) {
      setLoading(false);
      setData(null);
      return Promise.resolve();
    }
    // Invalidation bursts should schedule a fresh read, not continuously cancel it.
    if (flight.current) {
      pending.current = true;
      return flight.current;
    }
    const current = generation.current;
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const operation = (async () => {
      do {
        pending.current = false;
        try {
          const next = await request(path, schema, { signal });
          if (generation.current === current) {
            setData(next);
            setError(null);
          }
        } catch (value) {
          if (
            generation.current === current &&
            !(value instanceof DOMException && value.name === "AbortError")
          )
            setError(value);
        } finally {
          if (generation.current === current) setLoading(false);
        }
      } while (
        pending.current &&
        generation.current === current &&
        !signal.aborted
      );
    })().finally(() => {
      if (generation.current === current) flight.current = null;
    });
    flight.current = operation;
    return operation;
  }, [path, schema]);
  useEffect(() => {
    generation.current++;
    flight.current = null;
    pending.current = false;
    setData(null);
    setLoading(true);
    void reload();
    return () => {
      generation.current++;
      controller.current?.abort();
      flight.current = null;
    };
  }, [reload]);
  const priorRevision = useRef(revision);
  useEffect(() => {
    if (priorRevision.current !== revision) {
      priorRevision.current = revision;
      void reload();
    }
  }, [revision, reload]);
  useEffect(() => {
    if (!pollMs || !path) return;
    const interval = setInterval(() => void reload(), pollMs);
    return () => clearInterval(interval);
  }, [pollMs, path, reload]);
  return { data, error, loading, reload };
}
