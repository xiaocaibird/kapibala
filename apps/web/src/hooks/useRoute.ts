import { useEffect, useState } from "react";
import { getAgentNavigationContext } from "../state/agentNavigationSession";
export interface Route {
  page: string;
  id: string | null;
  agentOrigin: "groups" | "agent-runs" | null;
  agentGroup: string | null;
}
export function parseRoute(
  hash: string,
  context = getAgentNavigationContext(),
): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const [page, encodedId] = path.split("/");
  let id: string | null = null;
  try {
    id = encodedId ? decodeURIComponent(encodedId) : null;
  } catch {
    // A malformed deep link must still offer a usable, internal list page.
  }
  const params = new URLSearchParams(query);
  const origin = params.get("from");
  const currentLogin = context !== null && params.get("context") === context;
  return {
    page: page || "groups",
    id,
    agentOrigin:
      page === "agent-runs" &&
      id &&
      currentLogin &&
      (origin === "groups" || origin === "agent-runs")
        ? origin
        : null,
    agentGroup:
      page === "agent-runs" &&
      currentLogin &&
      (!id || origin === "groups" || origin === "agent-runs")
        ? params.get("group") || null
        : null,
  };
}
const readRoute = (): Route => parseRoute(location.hash);
export function agentDetailHref(
  id: string,
  origin: "groups" | "agent-runs",
  groupId?: string,
  context = getAgentNavigationContext(),
): string {
  if (!context) return `#/agent-runs/${encodeURIComponent(id)}`;
  const params = new URLSearchParams({ from: origin });
  params.set("context", context);
  if (groupId) params.set("group", groupId);
  return `#/agent-runs/${encodeURIComponent(id)}?${params}`;
}
export function agentListHref(
  groupId?: string | null,
  context = getAgentNavigationContext(),
): string {
  return `#/agent-runs${groupId && context ? `?${new URLSearchParams({ group: groupId, context })}` : ""}`;
}
export function agentReturnLink(
  origin: Route["agentOrigin"],
  groupId?: string,
  context = getAgentNavigationContext(),
): { href: string; label: string } {
  return origin === "groups"
    ? {
        href: groupId ? `#/groups/${encodeURIComponent(groupId)}` : "#/groups",
        label: groupId ? "返回原群组" : "返回群组工作台",
      }
    : {
        href: agentListHref(origin === "agent-runs" ? groupId : null, context),
        label: "返回 Agent 运行列表",
      };
}
export function useRoute(): Route {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const change = () => setRoute(readRoute());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return route;
}
export function navigate(page: string, id?: string): void {
  location.hash = `/${page}${id ? `/${encodeURIComponent(id)}` : ""}`;
}
