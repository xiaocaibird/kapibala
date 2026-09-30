import { sequenceRunSchema } from "../api/schemas";
import { useResource } from "../hooks/useResource";
import { Badge, DateTime, ErrorNotice, JsonView, Loading } from "./ui";
export function SequenceProgress({ id }: { id: string }) {
  const {
    data: run,
    error,
    loading,
    reload,
  } = useResource(
    `/api/sequence-runs/${encodeURIComponent(id)}`,
    sequenceRunSchema,
    800,
  );
  const done =
    run?.steps.filter((step) =>
      ["sent", "skipped", "failed"].includes(step.status),
    ).length ?? 0;
  return (
    <section className="panel sequence-progress">
      <div className="panel-header">
        <h2>序列执行进度</h2>
        {run && <Badge status={run.status} />}
      </div>
      <div className="panel-body">
        <span className="mono muted small">{id}</span>
        <ErrorNotice error={error} retry={() => void reload()} />
        {loading && !run ? (
          <Loading />
        ) : (
          run && (
            <>
              <div className="progress-caption">
                <strong>
                  {done} / {run.steps.length} 步已处理
                </strong>
                <span className="muted small">
                  当前步骤 {run.currentStepIndex}
                </span>
              </div>
              <progress
                value={done}
                max={run.steps.length || 1}
                aria-label="序列执行进度"
              />
              <div className="sequence-step-list">
                {run.steps.map((step) => (
                  <article className="sequence-step" key={step.index}>
                    <div className="split">
                      <strong>第 {step.index} 步</strong>
                      <Badge status={step.status} />
                    </div>
                    <div className="step-times">
                      <span>
                        计划发送 <DateTime value={step.scheduledAt} />
                      </span>
                      <span>
                        {step.status === "skipped" ? "跳过时间" : "实际发出"}{" "}
                        <DateTime value={step.sentAt} />
                      </span>
                    </div>
                    {step.clientMsgId && (
                      <code
                        className="muted small truncate"
                        title={step.clientMsgId}
                      >
                        {step.clientMsgId}
                      </code>
                    )}
                    <details>
                      <summary>变量与来源</summary>
                      <JsonView
                        value={{
                          resolvedVars: step.resolvedVars,
                          varSources: step.varSources,
                        }}
                      />
                    </details>
                  </article>
                ))}
              </div>
            </>
          )
        )}
      </div>
    </section>
  );
}
