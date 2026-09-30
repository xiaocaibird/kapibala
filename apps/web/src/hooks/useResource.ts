import { useCallback, useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import { request } from '../api/client';
import { useLive } from '../state/live';
export function useResource<T>(path: string | null, schema: z.ZodType<T>, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const { revision } = useLive();
  const reload = useCallback(async (): Promise<void> => {
    if (!path) { setLoading(false); setData(null); return; }
    controller.current?.abort();
    controller.current = new AbortController();
    const current = ++sequence.current;
    try { const next = await request(path, schema, { signal: controller.current.signal }); if (sequence.current === current) { setData(next); setError(null); } }
    catch (value) { if (sequence.current === current && !(value instanceof DOMException && value.name === 'AbortError')) setError(value); }
    finally { if (sequence.current === current) setLoading(false); }
  }, [path, schema]);
  useEffect(() => { setData(null); setLoading(true); void reload(); return () => { sequence.current++; controller.current?.abort(); }; }, [reload]);
  const priorRevision = useRef(revision);
  useEffect(() => { if (priorRevision.current !== revision) { priorRevision.current = revision; void reload(); } }, [revision, reload]);
  useEffect(() => { if (!pollMs || !path) return; const interval = setInterval(() => void reload(), pollMs); return () => clearInterval(interval); }, [pollMs, path, reload]);
  return { data, error, loading, reload };
}
