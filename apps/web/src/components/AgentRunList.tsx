import { agentRunSchema } from '../api/schemas';
import { useResource } from '../hooks/useResource';
import { Badge, Empty, ErrorNotice, Icon, Loading } from './ui';
const runsSchema = agentRunSchema.array();
export function AgentRunList({ groupId }: { groupId: string }) {
  const { data, error, loading, reload } = useResource(`/api/groups/${encodeURIComponent(groupId)}/agent-runs`, runsSchema, 2_000);
  return <section className="panel"><div className="panel-header"><h2><Icon name="activity" size={18}/>最近 Agent 运行</h2><span className="count">{data?.length ?? 0}</span></div><ErrorNotice error={error} retry={() => void reload()}/>{loading && !data ? <Loading/> : !data?.length ? <Empty title="暂无运行记录" icon="activity">开启 Agent 后，外部成员消息将触发运行。</Empty> : <div className="run-list">{data.map(run => <a className={`run-list-item ${run.status === 'blocked' ? 'run-blocked' : ''}`} href={`#/agent-runs/${encodeURIComponent(run.id)}`} key={run.id}><div className="split"><Badge status={run.status}/><Icon name="arrow" size={16}/></div><code className="truncate" title={run.id}>{run.id}</code><span className="muted small">{run.endReason ?? '正在执行工具步骤'}</span>{run.status === 'blocked' && <strong className="warning-text small">审计未得到明确结论，副作用已阻止。</strong>}</a>)}</div>}</section>;
}
