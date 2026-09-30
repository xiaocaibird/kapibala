import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, clearSession, getAccessToken, refreshAccessToken } from '../api/client';
import { eventSchema, type PlatformEvent } from '../api/schemas';
import { useAuth } from './auth';
export type ConnectionState = 'connecting' | 'live' | 'reconnecting';
interface LiveState { connection: ConnectionState; revision: number; notices: PlatformEvent[]; dismiss: (seq: number) => void; }
const LiveContext = createContext<LiveState | null>(null);
export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [revision, setRevision] = useState(0);
  const [notices, setNotices] = useState<PlatformEvent[]>([]);
  useEffect(() => {
    if (!user) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let handshakeTimer: ReturnType<typeof setTimeout> | undefined;
    let batchTimer: ReturnType<typeof setTimeout> | undefined;
    const storageKey = `kapibala:events:${user.username}`;
    let lastSeq = Number(sessionStorage.getItem(storageKey) ?? 0);
    if (!Number.isSafeInteger(lastSeq) || lastSeq < 0) lastSeq = 0;
    const invalidate = (): void => { if (batchTimer) return; batchTimer = setTimeout(() => { batchTimer = undefined; if (!disposed) setRevision(value => value + 1); }, 60); };
    const connect = async (): Promise<void> => {
      if (disposed) return;
      const token = getAccessToken();
      if (!token) return;
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
      const current = socket;
      handshakeTimer = setTimeout(() => current.close(), 5_000);
      current.onopen = () => current.send(JSON.stringify({ type: 'auth', accessToken: token, sinceSeq: lastSeq }));
      current.onmessage = event => {
        let data: unknown;
        try { data = JSON.parse(String(event.data)) as unknown; } catch { return; }
        if (typeof data === 'object' && data !== null && 'type' in data && data.type === 'auth') {
          if ('success' in data && data.success === true) { clearTimeout(handshakeTimer); setConnection('live'); invalidate(); }
          else current.close(4001, 'authentication failed');
          return;
        }
        const parsed = eventSchema.safeParse(data);
        if (!parsed.success || parsed.data.seq <= lastSeq) return;
        lastSeq = parsed.data.seq;
        sessionStorage.setItem(storageKey, String(lastSeq));
        if (['inconsistency', 'account_terminal'].includes(parsed.data.type) || (parsed.data.type === 'agent_run' && parsed.data.payload.status === 'blocked')) setNotices(items => [...items.filter(item => item.seq !== parsed.data.seq), parsed.data].slice(-8));
        invalidate();
      };
      current.onerror = () => current.close();
      current.onclose = () => {
        clearTimeout(handshakeTimer);
        if (disposed) return;
        setConnection('reconnecting');
        // Refresh is shared with REST; a disconnected socket may hold an expired access token.
        reconnectTimer = setTimeout(() => {
          void refreshAccessToken().then(connect).catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 401) clearSession();
            else if (!disposed) reconnectTimer = setTimeout(() => void connect(), 900);
          });
        }, 400);
      };
    };
    void connect();
    const visibility = () => { if (document.visibilityState === 'visible') { invalidate(); if (socket?.readyState === WebSocket.CLOSED) void connect(); } };
    window.addEventListener('online', visibility);
    document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; clearTimeout(reconnectTimer); clearTimeout(handshakeTimer); clearTimeout(batchTimer); socket?.close(); window.removeEventListener('online', visibility); document.removeEventListener('visibilitychange', visibility); };
  }, [user?.username]);
  return <LiveContext.Provider value={{ connection, revision, notices, dismiss: seq => setNotices(items => items.filter(item => item.seq !== seq)) }}>{children}</LiveContext.Provider>;
}
export function useLive(): LiveState { const value = useContext(LiveContext); if (!value) throw new Error('LiveProvider is required'); return value; }
