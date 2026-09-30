import { AttentionRegion } from "../attention";
import { useEffect, useRef } from "react";
import { jobSchema } from "../api/schemas";
import { useResource } from "../hooks/useResource";
import { Badge, ErrorNotice, Loading } from "./ui";
interface JobProgressProps {
  id: string;
  onComplete?: () => void;
}
export function JobProgress(props: JobProgressProps) {
  return <JobProgressContent key={props.id} {...props} />;
}
function JobProgressContent({ id, onComplete }: JobProgressProps) {
  const { data, error, reload, snapshot } = useResource(
    `/api/jobs/${encodeURIComponent(id)}`,
    jobSchema,
    800,
  );
  const completed = useRef(false);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  useEffect(() => {
    if (data && data.status !== "running" && !completed.current) {
      completed.current = true;
      callback.current?.();
    }
  }, [data]);
  return (
    <AttentionRegion
      rangeFallback
      renderRangeSummary={() =>
        data && (
          <div>
            <strong>
              当前任务结果 <Badge status={data.status} />
            </strong>
            {data.status === "running" && <p>任务仍在处理中。</p>}
            <p>已记录 {data.errors.length} 项错误。</p>
            {data.errors.slice(0, 3).map((item, index) => (
              <p key={`${item.step}-${index}`}>
                {item.step} · {item.code}
              </p>
            ))}
            {data.errors.length > 3 && (
              <p>其余 {data.errors.length - 3} 项详见任务记录。</p>
            )}
            {data.recoveryNote && (
              <p>
                {data.recoveryNote.slice(0, 200)}
                {data.recoveryNote.length > 200 ? "…" : ""}
              </p>
            )}
          </div>
        )
      }
      targetId={`job:${id}`}
      label="任务进度有更新"
      matchEvent={(event) =>
        event.type === "job_changed" && event.payload.jobId === id
      }
      version={JSON.stringify(data)}
      evidence={snapshot}
      ready={data !== null && !error}
      refresh={reload}
    >
      <div className="job-progress" aria-live="polite">
        <div className="split">
          <strong>异步任务</strong>
          {data && <Badge status={data.status} />}
        </div>
        <code>{id}</code>
        <ErrorNotice error={error} />
        {!data && !error && <Loading />}
        {data?.status === "running" && (
          <p className="muted">任务正在后台执行，进度会自动更新。</p>
        )}
        {data?.recoveryNote && (
          <div className="notice warning">{data.recoveryNote}</div>
        )}
        {data?.errors.map((item, index) => (
          <div className="notice error" key={`${item.step}-${index}`}>
            <span>{item.step}</span>
            <code>{item.code}</code>
          </div>
        ))}
        {data?.status === "finished" && (
          <p className="success-text">任务已完成，可刷新列表查看。</p>
        )}
      </div>
    </AttentionRegion>
  );
}
