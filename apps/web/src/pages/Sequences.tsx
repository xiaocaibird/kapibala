import { useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { ApiError, post } from '../api/client';
import { groupSchema, sequenceSchema, previewSchema, runIdSchema, idSchema, type Preview } from '../api/schemas';
import { useResource } from '../hooks/useResource';
import { useAuth } from '../state/auth';
import { Badge, Empty, ErrorNotice, Icon, JsonView, Loading, Modal, PageHeader } from '../components/ui';
import { SequenceProgress } from '../components/SequenceProgress';
const groupsSchema = groupSchema.array();
const sequencesSchema = sequenceSchema.array();
const varsSchema = z.record(z.string(), z.string());
const stepVarsSchema = z.record(z.string().regex(/^\d+$/), varsSchema);
const definitionSchema = z.object({ name: z.string().trim().min(1), steps: z.array(z.object({ index: z.number().int().positive(), accountRole: z.enum(['admin','member']), text: z.string().min(1), delaySeconds: z.number().nonnegative() })).min(1) });
interface StartPayload { sequenceId: string; vars: Record<string,string>; stepVars: Record<string,Record<string,string>>; }
interface PreviewState { groupId: string; payload: StartPayload; result: Preview; }
function parseInput<T>(text: string, schema: z.ZodType<T>, name: string): T {
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { throw new ApiError('VALIDATION_ERROR', `${name}必须为合法 JSON。`, 400); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError('VALIDATION_ERROR', `${name}格式不正确：${parsed.error.issues[0]?.path.join('.') || '根对象'}。请检查字段和值的类型。`, 400);
  return parsed.data;
}
export function Sequences({ groupId: requestedGroup }: { groupId: string | null }) {
  const { user } = useAuth();
  const groups = useResource('/api/groups', groupsSchema, 3_000);
  const sequences = useResource('/api/sequences', sequencesSchema);
  const [groupChoice, setGroupChoice] = useState(requestedGroup ?? '');
  const [sequenceChoice, setSequenceChoice] = useState('');
  const [varsText, setVarsText] = useState('{}');
  const [stepVarsText, setStepVarsText] = useState('{}');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [runIds, setRunIds] = useState<Record<string,string>>(() => { try { const raw: unknown = JSON.parse(sessionStorage.getItem('kapibala:sequenceRuns') ?? '{}'); return varsSchema.parse(raw); } catch { return {}; } });
  const [createOpen, setCreateOpen] = useState(false);
  const groupId = groups.data?.some(group => group.id === groupChoice) ? groupChoice : groups.data?.[0]?.id ?? '';
  const sequenceId = sequences.data?.some(sequence => sequence.id === sequenceChoice) ? sequenceChoice : sequences.data?.[0]?.id ?? '';
  const group = groups.data?.find(item => item.id === groupId);
  const sequence = sequences.data?.find(item => item.id === sequenceId);
  const runId = group?.activeSequenceRunId ?? runIds[groupId];
  const placeholders = useMemo(() => [...new Set(sequence?.steps.flatMap(step => [...step.text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match => match[1]).filter((key): key is string => Boolean(key))) ?? [])], [sequence]);
  const preflight = async (event: FormEvent): Promise<void> => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const payload: StartPayload = { sequenceId, vars: parseInput(varsText, varsSchema, '默认变量'), stepVars: parseInput(stepVarsText, stepVarsSchema, '分步变量') };
      const result = await post('/api/sequences/preview', previewSchema, payload);
      setPreview({ groupId, payload, result });
    } catch (value) { setError(value); }
    finally { setBusy(false); }
  };
  const start = async (): Promise<void> => {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const result = await post(`/api/groups/${encodeURIComponent(preview.groupId)}/sequence-runs`, runIdSchema, preview.payload);
      setRunIds(current => { const next = { ...current, [preview.groupId]: result.runId }; sessionStorage.setItem('kapibala:sequenceRuns', JSON.stringify(next)); return next; });
      setPreview(null); await groups.reload();
    } catch (value) { setError(value); }
    finally { setBusy(false); }
  };
  return <><PageHeader eyebrow="SCHEDULED MESSAGING" title="定时序列" subtitle="预检每一步的消息与变量来源，再有序发送到群组。" actions={user?.role === 'admin' && <button className="button secondary" onClick={() => setCreateOpen(true)}><Icon name="plus" size={16}/>新建序列</button>}/><ErrorNotice error={groups.error ?? sequences.error}/><ErrorNotice error={preview ? null : error}/><div className="sequence-layout"><section className="panel"><div className="panel-header"><h2>运行配置</h2><span className="muted small">先预检 · 后执行</span></div><form className="sequence-form" onSubmit={event => void preflight(event)}><label>目标群组<select value={groupId} onChange={event => { setGroupChoice(event.target.value); setError(null); }} required><option value="" disabled>请选择群组</option>{groups.data?.map(item => <option key={item.id} value={item.id}>{item.gatewayGroupId} · {item.status === 'active' ? '可用' : '不可用'}</option>)}</select></label><label>消息序列<select value={sequenceId} onChange={event => { setSequenceChoice(event.target.value); setError(null); }} required><option value="" disabled>请选择序列</option>{sequences.data?.map(item => <option key={item.id} value={item.id}>{item.name} · {item.steps.length} 步</option>)}</select></label>{sequences.loading && !sequence && <Loading/>}{sequence && <div className="sequence-definition">{sequence.steps.map(step => <div key={step.index}><span className="step-number">{step.index}</span><div><strong>{step.text}</strong><span>{step.accountRole === 'admin' ? '管理员 / 群主' : '普通成员'} · 延迟 {step.delaySeconds} 秒</span></div></div>)}</div>}{user?.role === 'admin' && <><label>默认变量 <code>vars</code><textarea className="code-input" rows={5} value={varsText} onChange={event => setVarsText(event.target.value)} spellCheck={false} aria-describedby="vars-help"/></label><p id="vars-help" className="field-help">JSON 键值对象。{placeholders.length ? `需要的占位符：${placeholders.join('、')}。` : '此序列没有占位符。'}空字符串视为未提供。</p><label>分步变量 <code>stepVars</code><textarea className="code-input" rows={5} value={stepVarsText} onChange={event => setStepVarsText(event.target.value)} spellCheck={false} aria-describedby="step-vars-help"/></label><p id="step-vars-help" className="field-help">例如 <code>{'{"2":{"location":"共享盘"}}'}</code>。从该步起沿用新值；空字符串保留原值。</p>{group?.activeSequenceRunId && <div className="notice warning">此群已有序列运行中，请等待完成。</div>}<button className="button primary full-width" disabled={busy || !sequenceId || !groupId || group?.status !== 'active' || Boolean(group?.activeSequenceRunId)}>{busy ? '正在预检…' : '预检所有步骤'}<Icon name="arrow" size={16}/></button></>}{user?.role === 'viewer' && <div className="notice info">当前为只读会话，可查看序列与执行进度。</div>}</form></section><div>{runId ? <SequenceProgress key={runId} id={runId}/> : <section className="panel"><Empty title="尚无序列运行" icon="sequence">选择序列并完成变量预检后，执行进度会在这里实时展示。</Empty></section>}<div className="sequence-note"><h3>发送后，再开始下一步计时</h3><p>限流时步骤等待恢复。没有匹配角色的可用账号时跳过；群不可写时停止运行。</p></div></div></div>{preview && <Modal wide title="预检通过 · 确认发送内容" onClose={() => { if (!busy) setPreview(null); }}><p className="muted">以下是每一步的最终文本和变量来源。启动时服务会再次完整校验。</p><ErrorNotice error={error}/><div className="preview-steps">{preview.result.steps.map(step => <article key={step.index} className="preview-step"><div className="split"><h3>第 {step.index} 步</h3><Badge status="pass"/></div><p className="preview-text">{step.text}</p>{Object.keys(step.resolvedVars).length ? <table><thead><tr><th>变量</th><th>最终取值</th><th>来源</th></tr></thead><tbody>{Object.entries(step.resolvedVars).map(([key,value]) => <tr key={key}><td><code>{key}</code></td><td>{value}</td><td>{sourceLabel(step.varSources[key] ?? '')}</td></tr>)}</tbody></table> : <p className="muted small">此步骤不使用变量。</p>}</article>)}</div><div className="modal-footer"><button className="button secondary" disabled={busy} onClick={() => setPreview(null)}>返回编辑</button><button className="button primary" disabled={busy} onClick={() => void start()}>{busy ? '正在启动…' : '确认启动序列'}</button></div></Modal>}{createOpen && <CreateSequence onClose={() => setCreateOpen(false)} onCreated={id => { setSequenceChoice(id); setCreateOpen(false); void sequences.reload(); }}/>}</>;
}
function sourceLabel(source: string): string { return source === 'default' ? '默认变量' : source.startsWith('step:') ? `第 ${source.slice(5)} 步赋值` : source; }
function CreateSequence({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [text, setText] = useState(JSON.stringify({ name: '活动提醒', steps: [{ index: 1, accountRole: 'admin', text: '{event} 将于 {time} 开始，请提前准备', delaySeconds: 10 },{ index: 2, accountRole: 'member', text: '提醒：{event} 的资料已上传到 {location}', delaySeconds: 5 }] }, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (event: FormEvent): Promise<void> => { event.preventDefault(); setBusy(true); setError(null); try { const value = parseInput(text, definitionSchema, '序列定义'); const result = await post('/api/sequences', idSchema, value); onCreated(result.id); } catch (value) { setError(value); } finally { setBusy(false); } };
  return <Modal wide title="新建消息序列" onClose={onClose}><form onSubmit={event => void submit(event)}><p className="muted">定义角色、消息模板和每一步的延迟。保存序列不会立即发送消息。</p><ErrorNotice error={error}/><label>序列 JSON<textarea className="code-input" rows={16} spellCheck={false} value={text} onChange={event => setText(event.target.value)} required/></label><details><summary>支持的字段</summary><JsonView value={{ name: '序列名称', steps: [{ index:'从 1 起的步骤序号',accountRole:'admin 或 member',text:'消息内容，支持 {key}',delaySeconds:'距前一步发出后的等待秒数' }] }}/></details><div className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy}>{busy ? '保存中…' : '保存序列'}</button></div></form></Modal>;
}
