import { useState, type FormEvent } from 'react';
import { post } from '../api/client';
import { accountSchema, jobIdSchema } from '../api/schemas';
import { useResource } from '../hooks/useResource';
import { ErrorNotice, Loading, Modal } from './ui';
const accountsSchema = accountSchema.array();
export function CreateGroup({ onClose, onCreated }: { onClose: () => void; onCreated: (jobId: string) => void }) {
  const { data, loading, error } = useResource('/api/accounts', accountsSchema);
  const [creator, setCreator] = useState('');
  const [admin, setAdmin] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const online = data?.filter(account => account.status === 'online') ?? [];
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault(); setBusy(true); setActionError(null);
    try { const { jobId } = await post('/api/groups', jobIdSchema, { creatorAccountId: creator, memberAccountIds: [admin, ...members.filter(id => id !== creator && id !== admin)] }); onCreated(jobId); }
    catch (value) { setActionError(value); }
    finally { setBusy(false); }
  };
  return <Modal title="创建群组" onClose={onClose}><form onSubmit={event => void submit(event)}><p className="muted">选择在线账号。管理员会在入群确认后自动提升权限。</p><ErrorNotice error={error ?? actionError}/>{loading ? <Loading/> : <><label>群主账号<select value={creator} onChange={event => { setCreator(event.target.value); if (admin === event.target.value) setAdmin(''); }} required><option value="">请选择群主</option>{online.map(account => <option key={account.id}>{account.id}</option>)}</select></label><label>管理员账号<select value={admin} onChange={event => setAdmin(event.target.value)} required><option value="">请选择管理员</option>{online.filter(account => account.id !== creator).map(account => <option key={account.id}>{account.id}</option>)}</select></label><fieldset><legend>其他成员 <span className="muted">可选</span></legend>{online.filter(account => account.id !== creator && account.id !== admin).map(account => <label className="checkbox-label" key={account.id}><input type="checkbox" checked={members.includes(account.id)} onChange={event => setMembers(values => event.target.checked ? [...values, account.id] : values.filter(value => value !== account.id))}/>{account.id}</label>)}{online.length < 2 && <p className="warning-text">至少需要两个在线账号，请先在服务账号页连接。</p>}</fieldset></>}<div className="modal-footer"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>取消</button><button className="button primary" disabled={busy || !creator || !admin || creator === admin}>{busy ? '正在提交…' : '创建群组'}</button></div></form></Modal>;
}
