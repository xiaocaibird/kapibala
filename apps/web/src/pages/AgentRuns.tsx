import {
  PageAttentionScope,
  AttentionRegion,
  useAttentionCollection,
} from "../attention";
import {
  acceptsAgentListEvent,
  agentStepKey,
  groupFields,
  runVersion,
} from "../attention/pageAdapters";
import { useState } from "react";
import { agentRunSchema, groupSchema } from "../api/schemas";
import { useResource } from "../hooks/useResource";
import { AgentRunList } from "../components/AgentRunList";
import {
  Badge,
  Empty,
  ErrorNotice,
  JsonView,
  Loading,
  PageHeader,
  label,
} from "../components/ui";
const groupsSchema = groupSchema.array();
export function AgentRuns() {
  const { data, error, snapshot, reload } = useResource(
    "/api/groups",
    groupsSchema,
  );
  const [selected, setSelected] = useState("");
  const groupId = data?.some((group) => group.id === selected)
    ? selected
    : (data?.[0]?.id ?? "");
  return (
    <PageAttentionScope
      key={groupId}
      scopeKey={`agent-runs:${groupId}`}
      title="Agent 运行"
      acceptEvent={(event) => acceptsAgentListEvent(event, groupId)}
    >
      <PageHeader
        eyebrow="AGENT OBSERVABILITY"
        title="Agent 运行"
        subtitle="逐步检查工具调用、审计结论与协议异常。"
      />
      <ErrorNotice error={error} />
      <AttentionRegion
        targetId="agent-selection"
        label="当前群组名称有更新"
        matchEvent={(event) => groupFields(event, groupId, ["name"])}
        version={JSON.stringify(
          data?.find((group) => group.id === groupId)?.name,
        )}
        evidence={snapshot}
        ready={data !== null && !error}
        refresh={reload}
      >
        <section className="panel selector-panel">
          <label className="inline-label">
            查看群组
            <select
              value={groupId}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="" disabled>
                请选择群组
              </option>
              {data?.map((group) => (
                <option key={group.id} value={group.id}>
                  {groupOptionLabel(group)}
                </option>
              ))}
            </select>
          </label>
        </section>
      </AttentionRegion>
      {groupId ? (
        <AgentRunList key={groupId} groupId={groupId} />
      ) : (
        <Empty title="暂无可查看的群组" icon="activity">
          创建群组并开启 Agent 后，运行记录将出现在这里。
        </Empty>
      )}
    </PageAttentionScope>
  );
}
export function AgentRunDetail({ id }: { id: string }) {
  const {
    data: run,
    error,
    loading,
    reload,
    snapshot,
  } = useResource(
    `/api/agent-runs/${encodeURIComponent(id)}`,
    agentRunSchema,
    1_000,
  );
  const steps = useAttentionCollection({
    targetId: `agent-steps:${id}`,
    label: "执行步骤有更新",
    eventKey: (event) => agentStepKey(event, id),
    versions: Object.fromEntries(
      (run?.steps ?? []).map((step, index) => [
        String(step.ordinal ?? index + 1),
        JSON.stringify([
          step.kind,
          step.toolUseId,
          step.name,
          step.resultSummary,
          step.isError,
          step.errorCode,
          step.auditVerdict,
        ]),
      ]),
    ),
    evidence: snapshot,
    ready: run !== null && !error,
    refresh: reload,
  });
  if (loading && !run) return <Loading />;
  if (!run)
    return (
      <>
        <ErrorNotice error={error} retry={() => void reload()} />
        <Empty title="未能读取运行记录" icon="activity" />
      </>
    );
  return (
    <>
      <a
        className="back-link"
        href={`#/groups/${encodeURIComponent(run.groupId)}`}
      >
        ← 返回群组
      </a>
      <PageHeader
        eyebrow="AGENT EXECUTION"
        title="运行详情"
        subtitle={run.id}
        actions={<Badge status={run.status} />}
      />
      <ErrorNotice error={error} />
      <AttentionRegion
        targetId={`agent-status:${id}`}
        label="运行状态有更新"
        matchEvent={(event) =>
          event.type === "agent_run" && event.payload.runId === id
        }
        version={runVersion(run)}
        evidence={snapshot}
        ready={!error}
        refresh={reload}
      >
        <div className="split">
          <strong>当前运行状态</strong>
          <Badge status={run.status} />
        </div>
        {run.status === "blocked" && (
          <div className="notice warning prominent">
            <strong>审计阻塞 · 副作用未执行</strong>
            <span>
              审计服务在重试后仍未给出明确结论。请检查下面的步骤与审计服务状态。
            </span>
          </div>
        )}
        {run.recoveryNote && (
          <div className="notice warning">{run.recoveryNote}</div>
        )}
        <div className="run-summary panel">
          <div>
            <span className="muted small">结束原因</span>
            <strong>{run.endReason ?? "—"}</strong>
          </div>
          <div>
            <span className="muted small">执行步数</span>
            <strong>
              {run.steps?.length ?? 0} <small>/ 12</small>
            </strong>
          </div>
          <div className="summary-text">
            <span className="muted small">运行摘要</span>
            <p>{run.summary || "尚未生成摘要"}</p>
          </div>
        </div>
      </AttentionRegion>
      {steps.notice}
      <div className="section-heading">
        <h2>执行轨迹</h2>
        <span className="muted small">每一步保留输入、结果和错误证据</span>
      </div>
      {!run.steps?.length ? (
        <section className="panel">
          <Empty title="正在等待第一步结果" icon="activity" />
        </section>
      ) : (
        <div className="step-list">
          {run.steps.map((step, index) => (
            <article
              key={step.ordinal ?? `${index}-${step.toolUseId}`}
              className={`panel agent-step ${step.isError ? "step-error" : ""}`}
            >
              <div className="agent-step-header">
                <span className="step-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{step.name ?? label(step.kind)}</h3>
                  <span className="mono muted small">
                    {step.toolUseId ?? "无工具调用 ID"}
                  </span>
                </div>
                <Badge status={step.kind} />
              </div>
              <div className="agent-step-body">
                {step.input !== null && (
                  <div>
                    <h4>输入参数</h4>
                    <JsonView value={step.input} />
                  </div>
                )}
                <div {...steps.itemProps(String(step.ordinal ?? index + 1))}>
                  <h4>
                    第 {step.ordinal ?? index + 1} 步 ·{" "}
                    {step.name ?? label(step.kind)} · 执行结果
                  </h4>
                  {step.auditVerdict && (
                    <span className="audit-result">
                      审计：
                      <Badge status={step.auditVerdict} />
                    </span>
                  )}
                  <p className={step.isError ? "error-text" : ""}>
                    {step.resultSummary || "—"}
                  </p>
                  {step.errorCode && (
                    <code className="error-code">{step.errorCode}</code>
                  )}
                </div>
              </div>
              {step.rawResponse && (
                <details className="raw-response">
                  <summary>
                    {step.kind === "protocol_error"
                      ? "查看协议错误原始响应"
                      : "查看原始响应"}{" "}
                    <span className="muted">最多 2 KB</span>
                  </summary>
                  <JsonView value={step.rawResponse} />
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
import { groupOptionLabel } from "../api/groupProfile";
