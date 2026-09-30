import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { request } from "../api/client";
import { useLive } from "../state/live";
import type { SnapshotEvidence } from "../attention/model";
export function useResource<T>(
  path: string | null,
  schema: z.ZodType<T>,
  pollMs = 0,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<SnapshotEvidence | null>(null);
  const snapshotRevision = useRef(0);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const flight = useRef<Promise<void> | null>(null);
  const pending = useRef(false);
  const { revision, getLastSeq } = useLive();
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
        const startedSeq = getLastSeq();
        try {
          const next = await request(path, schema, { signal });
          if (generation.current === current) {
            setData(next);
            setError(null);
            setSnapshot({
              seq: startedSeq,
              revision: ++snapshotRevision.current,
              path,
            });
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
  }, [path, schema, getLastSeq]);
  useEffect(() => {
    generation.current++;
    flight.current = null;
    pending.current = false;
    setData(null);
    setSnapshot(null);
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
  return { data, error, loading, reload, snapshot };
}
