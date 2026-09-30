import { useState, type FormEvent } from 'react';
import { useAuth } from '../state/auth';
import { ErrorNotice, Icon } from '../components/ui';
export function Login() {
  const { login, restoreError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (event: FormEvent): Promise<void> => { event.preventDefault(); setBusy(true); setError(null); try { await login(username, password); } catch (value) { setError(value); } finally { setBusy(false); } };
  return <main className="login-page"><section className="login-story"><a className="brand" href="#/groups"><span className="brand-mark">K</span>kapibala<span className="brand-dot">.</span></a><div className="login-copy"><span className="eyebrow">MESSAGING OPERATIONS</span><h1>每一次沟通，<br/>都有迹可循。</h1><p>连接服务账号、协同群组运营，<br/>让自动应答与定时消息清晰可控。</p><div className="login-grid"><span><Icon name="users"/>多账号管理</span><span><Icon name="activity"/>执行可追踪</span><span><Icon name="sequence"/>消息自动化</span></div></div><footer>Kapibala Console <span>可靠连接 · 有序协作</span></footer></section><section className="login-form-panel"><form className="login-form" onSubmit={event => void submit(event)}><span className="eyebrow">WELCOME BACK</span><h2>登录工作台</h2><p>使用平台账号继续。</p>{restoreError && <div className="notice warning">{restoreError}</div>}<ErrorNotice error={error}/><label>用户名<input autoFocus autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required placeholder="输入用户名"/></label><label>密码<input autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} required placeholder="输入密码"/></label><button className="button primary login-submit" disabled={busy}>{busy ? '正在登录…' : '进入工作台'}<Icon name="arrow"/></button><div className="login-help"><strong>本地演示账号</strong><span>管理员 <code>admin / admin</code></span><span>只读账号 <code>viewer / viewer</code></span></div></form></section></main>;
}
