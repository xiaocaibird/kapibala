import type { GroupDirectoryItem } from "../../../../packages/contracts/src/index";
import type { DirectoryQuery } from "./controller";

export function hasDirectoryConditions(
  query: Pick<DirectoryQuery, "q" | "status" | "agentEnabled">,
): boolean {
  return (
    query.q.trim() !== "" ||
    query.status !== undefined ||
    query.agentEnabled !== undefined
  );
}

export function directoryMatch(
  item: GroupDirectoryItem,
  query: string,
): { description: string | null; hint: string | null } {
  const q = query.trim().toLowerCase();
  const directMatch =
    !q ||
    (item.name ?? "").toLowerCase().includes(q) ||
    item.gatewayGroupId.toLowerCase().includes(q);
  if (!directMatch && item.id.toLowerCase().includes(q))
    return {
      description: item.description,
      hint: `匹配平台群 ID · ${item.id}`,
    };
  const index = q ? (item.description ?? "").toLowerCase().indexOf(q) : -1;
  if (!directMatch && item.description && index >= 0) {
    const start = Math.max(0, index - 24);
    const end = Math.min(item.description.length, index + q.length + 64);
    return {
      description: `${start ? "…" : ""}${item.description.slice(start, end)}${end < item.description.length ? "…" : ""}`,
      hint: "匹配群简介",
    };
  }
  return { description: item.description, hint: null };
}
