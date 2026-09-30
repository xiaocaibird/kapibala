import { useState } from 'react';
import { groupSchema } from '../api/schemas';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../state/auth';
import { Badge, Empty, ErrorNotice, Icon, Loading, PageHeader } from '../components/ui';
import { CreateGroup } from '../components/CreateGroup';
import { JobProgress } from '../components/JobProgress';
const groupsSchema = groupSchema.array();
export function Groups() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useResource('/api/groups', groupsSchema, 5_000);
  const [createOpen, setCreateOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(() => sessionStorage.getItem('kapibala:createJob'));
  return <><PageHeader eyebrow="GROUP WORKSPACE" title="群组工作台" subtitle="管理群成员、跟进消息，掌握每一次自动执行。" actions={user?.role === 'admin' && <button className="button primary" onClick={() => setCreateOpen(true)}><Icon name="plus" size={18}/>创建群组</button>}/><ErrorNotice error={error} retry={() => void reload()}/>{jobId && <div className="panel job-panel"><button className="icon-button dismiss" aria-label="隐藏任务" onClick={() => { setJobId(null); sessionStorage.removeItem('kapibala:createJob'); }}>×</button><JobProgress id={jobId} onComplete={() => void reload()}/></div>}<div className="section-heading"><h2>所有群组 <span className="count">{data?.length ?? 0}</span></h2><span className="muted small">选择群组进入消息时间线</span></div>{loading && !data ? <Loading/> : !data?.length ? <section className="panel"><Empty title="从第一个群组开始">{user?.role === 'admin' ? '连接服务账号后，创建一个群组开始协作。' : '暂时没有群组，请等待管理员创建。'}</Empty></section> : <div className="group-grid">{data.map(group => <a key={group.id} href={`#/groups/${encodeURIComponent(group.id)}`} className="group-card"><div className="split"><span className="group-avatar"><Icon name="chat" size={25}/></span><Badge status={group.status}/></div><h3>{group.gatewayGroupId}</h3><span className="mono muted small truncate" title={group.id}>{group.id}</span><div className="group-card-stats"><span><Icon name="users" size={16}/>{group.members.length} 位成员</span><span className={group.agentEnabled ? 'success-text' : 'muted'}><span className="dot"/>Agent {group.agentEnabled ? '已开启' : '未开启'}</span></div><div className="group-card-footer"><span>{group.activeAgentRunId ? 'Agent 正在运行' : group.activeSequenceRunId ? '定时序列运行中' : '查看群组详情'}</span><Icon name="arrow" size={18}/></div></a>)}</div>}{createOpen && <CreateGroup onClose={() => setCreateOpen(false)} onCreated={id => { setJobId(id); sessionStorage.setItem('kapibala:createJob', id); setCreateOpen(false); void reload(); }}/>}</>;
}
