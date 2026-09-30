import { useEffect, useRef } from 'react';
import { jobSchema } from '../api/schemas';
import { useResource } from '../hooks/useResource';
import { Badge, ErrorNotice, Loading } from './ui';
export function JobProgress({ id, onComplete }: { id: string; onComplete?: () => void }) {
  const { data, error } = useResource(`/api/jobs/${encodeURIComponent(id)}`, jobSchema, 800);
  const completed = useRef(false);
  const callback = useRef(onComplete); callback.current = onComplete;
  useEffect(() => { if (data && data.status !== 'running' && !completed.current) { completed.current = true; callback.current?.(); } }, [data]);
  return <div className="job-progress" aria-live="polite"><div className="split"><strong>异步任务</strong>{data && <Badge status={data.status}/>}</div><code>{id}</code><ErrorNotice error={error}/>{!data && !error && <Loading/>}{data?.status === 'running' && <p className="muted">任务正在后台执行，进度会自动更新。</p>}{data?.recoveryNote && <div className="notice warning">{data.recoveryNote}</div>}{data?.errors.map((item,index) => <div className="notice error" key={`${item.step}-${index}`}><span>{item.step}</span><code>{item.code}</code></div>)}{data?.status === 'finished' && <p className="success-text">任务已完成，列表已更新。</p>}</div>;
}
