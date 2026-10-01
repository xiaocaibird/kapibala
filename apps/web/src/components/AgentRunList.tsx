import { useAttentionCollection } from "../attention";
import {
  definitiveAgentListEvent,
  eventEntity,
} from "../attention/pageAdapters";
import { agentRunSchema } from "../api/schemas";
import { useResource } from "../hooks/useResource";
import { Badge, Empty, ErrorNotice, Icon, Loading } from "./ui";
const runsSchema = agentRunSchema.array();
export function AgentRunList({ groupId }: { groupId: string }) {
  const { data, error, loading, reload, snapshot } = useResource(
    `/api/groups/${encodeURIComponent(groupId)}/agent-runs`,
    runsSchema,
    2_000,
  );
  const attention = useAttentionCollection({
    targetId: `agent-runs:${groupId}`,
    label: "Agent 运行列表有更新",
    eventKey: (event) =>
      event.payload.groupId === groupId
        ? eventEntity(event, ["agent_run"], "runId")
        : null,
    definitiveEvent: definitiveAgentListEvent,
    versions: Object.fromEntries(
      (data ?? []).map((run) => [
        run.id,
        JSON.stringify([run.status, run.endReason]),
      ]),
    ),
    evidence: snapshot,
    ready: data !== null && !error,
    refresh: reload,
    rangeFallback: true,
    renderRangeSummary: () =>
      data && (
        <div>
          <strong>当前结果：{data.length} 条运行记录</strong>
          {data.slice(0, 3).map((run) => (
            <p key={run.id}>
              <code>{run.id}</code> <Badge status={run.status} />{" "}
              {run.endReason ?? "执行中"}
            </p>
          ))}
          {data.length > 3 && <p>另有 {data.length - 3} 条，详见运行列表。</p>}
          {!data.length && <p>当前没有运行记录。</p>}
        </div>
      ),
  });
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>
          <Icon name="activity" size={18} />
          最近 Agent 运行
        </h2>
        <span className="count">{data?.length ?? 0}</span>
      </div>
      {attention.notice}
      <ErrorNotice error={error} retry={() => void reload()} />
      {loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <Empty title="暂无运行记录" icon="activity">
          开启 Agent 后，外部成员消息将触发运行。
        </Empty>
      ) : (
        <div className="run-list">
          {data.map((run) => (
            <a
              className={`run-list-item ${run.status === "blocked" ? "run-blocked" : ""}`}
              href={`#/agent-runs/${encodeURIComponent(run.id)}`}
              key={run.id}
              {...attention.itemProps(run.id)}
            >
              <div className="split">
                <Badge status={run.status} />
                <Icon name="arrow" size={16} />
              </div>
              <code className="truncate" title={run.id}>
                {run.id}
              </code>
              <span className="muted small">
                {run.endReason ?? "正在执行工具步骤"}
              </span>
              {run.status === "blocked" && (
                <strong className="warning-text small">
                  本次工具的审计未得到明确结论，未执行其副作用。此前步骤可能已执行。
                </strong>
              )}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
