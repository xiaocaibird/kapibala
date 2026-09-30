import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "../api/client";
import { messagesSchema, type Message } from "../api/schemas";
import { useLive } from "../state/live";
import { mergeMessages } from "../api/messages";

export function useTimeline(groupId: string) {
  const [items, setItems] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const { revision } = useLive();
  const generation = useRef(0);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const path = `/api/groups/${encodeURIComponent(groupId)}/messages`;
  useEffect(() => {
    const current = ++generation.current;
    inFlight.current = false;
    pending.current = false;
    setItems([]);
    setCursor(null);
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    void request(path, messagesSchema, { signal: controller.signal })
      .then((page) => {
        if (generation.current !== current) return;
        setItems((existing) => mergeMessages(page.items, existing));
        setCursor(page.nextCursor);
      })
      .catch((value: unknown) => {
        if (
          generation.current === current &&
          !(value instanceof DOMException && value.name === "AbortError")
        )
          setError(value);
      })
      .finally(() => {
        if (generation.current === current) setLoading(false);
      });
    return () => {
      generation.current++;
      controller.abort();
    };
  }, [path]);
  const reconcile = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    const current = generation.current;
    inFlight.current = true;
    setSyncing(true);
    try {
      do {
        pending.current = false;
        let next: string | null = null;
        let fresh: Message[] = [];
        const visited = new Set<string>();
        // A late gateway message can predate any visible row. Walk the fresh snapshot
        // completely; stopping at the first overlap would lose historical backfill.
        do {
          const page: { items: Message[]; nextCursor: string | null } =
            await request(
              `${path}?limit=50${next ? `&before=${encodeURIComponent(next)}` : ""}`,
              messagesSchema,
            );
          if (generation.current !== current) return;
          fresh = mergeMessages(fresh, page.items);
          next = page.nextCursor;
          if (next && visited.has(next))
            throw new Error("消息分页游标重复，请重试并检查服务端分页。");
          if (next) visited.add(next);
        } while (next);
        setItems((existing) => mergeMessages(existing, fresh));
        setCursor(null);
        setError(null);
      } while (pending.current && generation.current === current);
    } catch (value) {
      if (generation.current === current) setError(value);
    } finally {
      if (generation.current === current) {
        inFlight.current = false;
        setSyncing(false);
      }
    }
  }, [path]);
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
  };
}
