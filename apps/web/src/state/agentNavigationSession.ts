// A local browsing-context marker, never an authorization credential. Restore
// only after the server has confirmed the current login identity.
const storageKey = "kapibala:agentNavigationSession";
let activeContext: string | null = null;
interface NavigationIdentity {
  username: string;
  role: string;
}
export const getAgentNavigationContext = (): string | null => activeContext;

export function activateAgentNavigationSession(
  identity: NavigationIdentity,
  restore: boolean,
): void {
  activeContext = null;
  try {
    const owner = JSON.stringify([identity.username, identity.role]);
    const raw: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "null",
    );
    const saved =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const context =
      restore &&
      saved?.owner === owner &&
      typeof saved.context === "string" &&
      /^[0-9a-f-]{36}$/.test(saved.context)
        ? saved.context
        : crypto.randomUUID();
    sessionStorage.setItem(storageKey, JSON.stringify({ owner, context }));
    activeContext = context;
  } catch {
    // Login still works if browser storage is unavailable. In that document,
    // source hints are ignored and details retain their internal fallback.
  }
}

export function clearAgentNavigationSession(): void {
  activeContext = null;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* Fail closed in memory. */
  }
  try {
    const [path = "", query = ""] = location.hash.split("?");
    if (!/^#\/?agent-runs(?:\/|$)/.test(path)) return;
    const params = new URLSearchParams(query);
    for (const key of ["from", "group", "context"]) params.delete(key);
    const next = `${path}${params.size ? `?${params}` : ""}`;
    // Do not add a history entry: older entries are rejected by context checks.
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${location.search}${next}`,
    );
  } catch {
    /* A navigation hint must never make logout/login fail. */
  }
}
