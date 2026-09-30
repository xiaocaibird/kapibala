import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { getSessionGeneration, request } from "../api/client";
import { useLive } from "../state/live";
import type { SnapshotEvidence } from "../attention/model";
import { createResourceLoader } from "./resourceLoader";
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
  const loader = useRef<ReturnType<typeof createResourceLoader> | null>(null);
  const { revision, getLastSeq } = useLive();
  const reload = useCallback(
    (): Promise<void> => loader.current?.reload() ?? Promise.resolve(),
    [],
  );
  useEffect(() => {
    setData(null);
    setError(null);
    setSnapshot(null);
    setLoading(true);
    if (!path) {
      setLoading(false);
      return;
    }
    const current = createResourceLoader({
      load: async (signal) => {
        const seq = getLastSeq();
        return { data: await request(path, schema, { signal }), seq };
      },
      readGeneration: getSessionGeneration,
      onValue: (value) => {
        setData(value.data);
        setError(null);
        setSnapshot({
          seq: value.seq,
          revision: ++snapshotRevision.current,
          path,
        });
      },
      onError: setError,
      onSettled: () => setLoading(false),
    });
    loader.current = current;
    void current.reload();
    return () => {
      current.dispose();
      if (loader.current === current) loader.current = null;
    };
  }, [path, schema, getLastSeq]);
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
