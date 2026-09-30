import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { ApiError, getAccessToken, refreshAccessToken } from "../api/client";
import { eventSchema, type PlatformEvent } from "../api/schemas";
import { useAuth } from "./auth";
import { affectsGroupDirectory } from "../directory/controller";
export type ConnectionState = "connecting" | "live" | "reconnecting";
interface LiveState {
  connection: ConnectionState;
  revision: number;
  directoryRevision: number;
  notices: PlatformEvent[];
  dismiss: (seq: number) => void;
  subscribe: (listener: (event: PlatformEvent) => void) => () => void;
  getLastSeq: () => number;
  markScope: (signal?: AbortSignal) => Promise<number>;
}
const LiveContext = createContext<LiveState | null>(null);
export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [revision, setRevision] = useState(0);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [notices, setNotices] = useState<PlatformEvent[]>([]);
  const listeners = useRef(new Set<(event: PlatformEvent) => void>());
  const lastSequence = useRef(0);
  const markerSender = useRef<((requestId: string) => void) | null>(null);
  const markers = useRef(
    new Map<
      string,
      {
        resolve: (seq: number) => void;
        reject: (error: Error) => void;
        cleanup: () => void;
      }
    >(),
  );
  const subscribe = useCallback((listener: (event: PlatformEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const getLastSeq = useCallback(() => lastSequence.current, []);
  const markScope = useCallback(
    (signal?: AbortSignal): Promise<number> =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error("Scope disposed"));
          return;
        }
        const requestId = crypto.randomUUID();
        const cancel = () => {
          markers.current.get(requestId)?.cleanup();
          markers.current.delete(requestId);
          reject(new Error("Scope disposed"));
        };
        const timer = setTimeout(() => {
          markers.current.get(requestId)?.cleanup();
          markers.current.delete(requestId);
          reject(new Error("实时提醒起点暂未建立，请等待连接恢复。"));
        }, 10_000);
        markers.current.set(requestId, {
          resolve,
          reject,
          cleanup: () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", cancel);
          },
        });
        signal?.addEventListener("abort", cancel, { once: true });
        markerSender.current?.(requestId);
      }),
    [],
  );
  useEffect(() => {
    setNotices([]);
    lastSequence.current = 0;
    if (!user) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let handshakeTimer: ReturnType<typeof setTimeout> | undefined;
    let batchTimer: ReturnType<typeof setTimeout> | undefined;
    const storageKey = `kapibala:events:${user.username}`;
    let lastSeq = Number(sessionStorage.getItem(storageKey) ?? 0);
    if (!Number.isSafeInteger(lastSeq) || lastSeq < 0) lastSeq = 0;
    lastSequence.current = lastSeq;
    let directoryPending = false;
    const invalidate = (directory = false): void => {
      directoryPending ||= directory;
      if (batchTimer) return;
      batchTimer = setTimeout(() => {
        batchTimer = undefined;
        if (!disposed) {
          setRevision((value) => value + 1);
          if (directoryPending) setDirectoryRevision((value) => value + 1);
        }
        directoryPending = false;
      }, 60);
    };
    const connect = async (): Promise<void> => {
      if (
        disposed ||
        (socket &&
          (socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING))
      )
        return;
      clearTimeout(reconnectTimer);
      const token = getAccessToken();
      if (!token) return;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
      );
      const current = socket;
      handshakeTimer = setTimeout(() => current.close(), 5_000);
      current.onopen = () =>
        current.send(
          JSON.stringify({
            type: "auth",
            accessToken: token,
            sinceSeq: lastSeq,
          }),
        );
      current.onmessage = (event) => {
        // A prior session/socket may still deliver a queued callback after close.
        // It must not advance the new session's snapshot evidence or subscribers.
        if (disposed || socket !== current) return;
        let data: unknown;
        try {
          data = JSON.parse(String(event.data)) as unknown;
        } catch {
          return;
        }
        if (
          typeof data === "object" &&
          data !== null &&
          "type" in data &&
          data.type === "auth"
        ) {
          if ("success" in data && data.success === true) {
            clearTimeout(handshakeTimer);
            setConnection("live");
            invalidate(true);
            markerSender.current = (requestId) => {
              if (current.readyState === WebSocket.OPEN)
                current.send(
                  JSON.stringify({ type: "scope_marker", requestId }),
                );
            };
            for (const requestId of markers.current.keys())
              markerSender.current(requestId);
          } else current.close(4001, "authentication failed");
          return;
        }
        if (
          typeof data === "object" &&
          data !== null &&
          "type" in data &&
          data.type === "scope_ready"
        ) {
          if (
            "requestId" in data &&
            typeof data.requestId === "string" &&
            "startSeq" in data &&
            typeof data.startSeq === "number" &&
            Number.isSafeInteger(data.startSeq) &&
            data.startSeq >= 0
          ) {
            const marker = markers.current.get(data.requestId);
            if (marker) {
              marker.cleanup();
              markers.current.delete(data.requestId);
              marker.resolve(data.startSeq);
            }
          }
          return;
        }
        const parsed = eventSchema.safeParse(data);
        if (!parsed.success || parsed.data.seq <= lastSeq) return;
        lastSeq = parsed.data.seq;
        lastSequence.current = lastSeq;
        sessionStorage.setItem(storageKey, String(lastSeq));
        for (const listener of listeners.current) listener(parsed.data);
        if (
          ["inconsistency", "account_terminal"].includes(parsed.data.type) ||
          (parsed.data.type === "agent_run" &&
            parsed.data.payload.status === "blocked")
        )
          setNotices((items) =>
            [
              ...items.filter((item) => item.seq !== parsed.data.seq),
              parsed.data,
            ].slice(-8),
          );
        invalidate(affectsGroupDirectory(parsed.data.type));
      };
      current.onerror = () => current.close();
      current.onclose = (event) => {
        clearTimeout(handshakeTimer);
        if (disposed || socket !== current) return;
        setConnection("reconnecting");
        markerSender.current = null;
        // Refresh only rejected credentials. A transport reconnect keeps a valid session.
        reconnectTimer = setTimeout(() => {
          const restored = [4001, 4401, 1008].includes(event.code)
            ? refreshAccessToken()
            : Promise.resolve(token);
          void restored.then(connect).catch((error: unknown) => {
            // The API client owns generation-checked session invalidation.
            // An old socket's refresh rejection must not clear a later login.
            if (disposed || (error instanceof ApiError && error.status === 401))
              return;
            reconnectTimer = setTimeout(() => void connect(), 900);
          });
        }, 400);
      };
    };
    void connect();
    const visibility = () => {
      if (document.visibilityState === "visible") {
        invalidate(true);
        if (socket?.readyState === WebSocket.CLOSED) void connect();
      }
    };
    window.addEventListener("online", visibility);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      markerSender.current = null;
      for (const marker of markers.current.values()) {
        marker.cleanup();
        marker.reject(new Error("Session ended"));
      }
      markers.current.clear();
      clearTimeout(reconnectTimer);
      clearTimeout(handshakeTimer);
      clearTimeout(batchTimer);
      socket?.close();
      window.removeEventListener("online", visibility);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [user?.username]);
  return (
    <LiveContext.Provider
      value={{
        connection,
        revision,
        directoryRevision,
        notices,
        subscribe,
        getLastSeq,
        markScope,
        dismiss: (seq) =>
          setNotices((items) => items.filter((item) => item.seq !== seq)),
      }}
    >
      {children}
    </LiveContext.Provider>
  );
}
export function useLive(): LiveState {
  const value = useContext(LiveContext);
  if (!value) throw new Error("LiveProvider is required");
  return value;
}
