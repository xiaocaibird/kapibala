import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "../api/client";
import { messagesSchema, type Message } from "../api/schemas";
import { useLive } from "../state/live";
import { mergeMessages } from "../api/messages";
import { createSnapshotReconciler } from "./snapshotReconciler";
import type { SnapshotEvidence } from "../attention/model";

interface TimelineSnapshot {
  items: Message[];
  seq: number;
}

export function useTimeline(groupId: string) {
  const [items, setItems] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [snapshot, setSnapshot] = useState<SnapshotEvidence | null>(null);
  const snapshotRevision = useRef(0);
  const { revision, getLastSeq } = useLive();
  const generation = useRef(0);
  const reconciler = useRef<ReturnType<
    typeof createSnapshotReconciler<TimelineSnapshot>
  > | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const path = `/api/groups/${encodeURIComponent(groupId)}/messages`;
  useEffect(() => {
    const current = ++generation.current;
    setItems([]);
    setCursor(null);
    setLoading(true);
    setLoadingEarlier(false);
    setSyncing(false);
    setError(null);
    setSnapshot(null);
    const controller = new AbortController();
    lifetime.current = controller;
    let reconciled = false;
    const coordinator = createSnapshotReconciler<TimelineSnapshot>({
      load: async (signal) => {
        const seq = getLastSeq();
        let next: string | null = null;
        let fresh: Message[] = [];
        const visited = new Set<string>();
        // A late gateway message can predate any visible row. Retry the complete
        // fresh snapshot after any failed page instead of losing that backfill.
        do {
          const page: { items: Message[]; nextCursor: string | null } =
            await request(
              `${path}?limit=50${next ? `&before=${encodeURIComponent(next)}` : ""}`,
              messagesSchema,
              { signal },
            );
          signal.throwIfAborted();
          fresh = mergeMessages(fresh, page.items);
          next = page.nextCursor;
          if (next && visited.has(next))
            throw new Error("消息分页游标重复，请重试并检查服务端分页。");
          if (next) visited.add(next);
        } while (next);
        return { items: fresh, seq };
      },
      onValue: (fresh) => {
        reconciled = true;
        setItems((existing) => mergeMessages(existing, fresh.items));
        setCursor(null);
        setError(null);
        setSnapshot({
          seq: fresh.seq,
          revision: ++snapshotRevision.current,
          path,
        });
      },
      onError: setError,
      onSyncing: setSyncing,
    });
    reconciler.current = coordinator;
    const initialSeq = getLastSeq();
    void request(path, messagesSchema, { signal: controller.signal })
      .then((page) => {
        if (generation.current !== current) return;
        setItems((existing) => mergeMessages(page.items, existing));
        if (!reconciled) {
          setCursor(page.nextCursor);
          setSnapshot({
            seq: initialSeq,
            revision: ++snapshotRevision.current,
            path,
          });
        }
      })
      .catch((value: unknown) => {
        if (
          generation.current === current &&
          !reconciled &&
          !(value instanceof DOMException && value.name === "AbortError")
        ) {
          setError(value);
          void coordinator.invalidate();
        }
      })
      .finally(() => {
        if (generation.current === current) setLoading(false);
      });
    return () => {
      generation.current++;
      controller.abort();
      coordinator.dispose();
      if (reconciler.current === coordinator) reconciler.current = null;
      if (lifetime.current === controller) lifetime.current = null;
    };
  }, [path, getLastSeq]);
  const reconcile = useCallback(
    (): Promise<void> => reconciler.current?.invalidate() ?? Promise.resolve(),
    [],
  );
  const prior = useRef(revision);
  useEffect(() => {
    if (prior.current !== revision) {
      prior.current = revision;
      void reconcile();
    }
  }, [revision, reconcile]);
  const loadEarlier = async (): Promise<void> => {
    if (!cursor || loadingEarlier) return;
    const current = generation.current;
    setLoadingEarlier(true);
    try {
      const page = await request(
        `${path}?limit=50&before=${encodeURIComponent(cursor)}`,
        messagesSchema,
        { signal: lifetime.current?.signal },
      );
      if (generation.current === current) {
        // Old snapshot rows must not replace newer delivery state or corrected sentAt.
        setItems((existing) => mergeMessages(existing, page.items, false));
        setCursor(page.nextCursor);
        setError(null);
      }
    } catch (value) {
      if (generation.current === current) setError(value);
    } finally {
      if (generation.current === current) setLoadingEarlier(false);
    }
  };
  return {
    items,
    cursor,
    loading,
    loadingEarlier,
    syncing,
    error,
    loadEarlier,
    reconcile,
    snapshot,
  };
}
