import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Command } from './types.js';
import { BlockedError, redact } from './security.js';

export const exec = promisify(execFile);
// A live guardian owns the detached process group until cleanup. The command may exit,
// but its PID cannot be recycled into an unrelated group before we reap descendants.
const guardian = `const {spawn}=require('node:child_process');
const c=JSON.parse(process.argv[1]); const hold=setInterval(()=>{},1000);
process.on('SIGTERM',()=>{}); process.on('disconnect',()=>{try{process.kill(-process.pid,'SIGKILL')}catch{process.exit(1)}});
const p=spawn(c.command,c.args,{stdio:['ignore','inherit','inherit'],env:process.env});
process.on('message',m=>{if(m?.type==='kill-application'&&p.exitCode===null&&p.signalCode===null)p.kill('SIGKILL')});
p.once('spawn',()=>process.send?.({type:'ready'}));
p.once('error',e=>process.send?.({type:'error',message:e.message}));
p.once('exit',(code,signal)=>process.send?.({type:'exit',code,signal}));`;
export class OwnedProcess {
  private child?: ChildProcess;
  private writes = Promise.resolve();
  private writeError?: unknown;
  private outcome?: { code: number | null; signal: NodeJS.Signals | null };
  private ended?: Promise<void>;
  private stopping?: Promise<void>;
  constructor(
    readonly command: Command,
    readonly cwd: string,
    readonly env: NodeJS.ProcessEnv,
    readonly log: string,
  ) {}
  get pid(): number | undefined {
    return this.child?.pid;
  }
  get exitOutcome(): { code: number | null; signal: NodeJS.Signals | null } | undefined {
    return this.outcome ? { ...this.outcome } : undefined;
  }
  get running(): boolean {
    return (
      !!this.child &&
      this.child.exitCode === null &&
      this.child.signalCode === null &&
      !this.outcome
    );
  }
  assertRunning(): void {
    if (!this.running)
      throw new Error(`被测命令已退出，不能借用其他进程的健康端点: ${this.command.command}`);
  }
  async start(): Promise<void> {
    if (this.child) throw new Error('Owned process already started; stop before restart');
    await mkdir(dirname(this.log), { recursive: true });
    this.outcome = undefined;
    this.writeError = undefined;
    this.stopping = undefined;
    const child = spawn(process.execPath, ['-e', guardian, JSON.stringify(this.command)], {
      cwd: this.cwd,
      env: this.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    this.child = child;
    this.ended = new Promise<void>((ok) => child.once('close', () => ok()));
    child.on('message', (value) => {
      const m = value as { type: string; code: number | null; signal: NodeJS.Signals | null };
      if (m.type === 'exit') this.outcome = { code: m.code, signal: m.signal };
    });
    for (const stream of [child.stdout, child.stderr])
      stream?.on('data', (chunk) => {
        this.writes = this.writes
          .then(() => appendFile(this.log, redact(chunk.toString())))
          .catch((e) => {
            this.writeError = e;
          });
      });
    try {
      await new Promise<void>((ok, bad) => {
        const timer = setTimeout(() => bad(new Error('进程监督器启动超时')), 10000);
        const finish = (e?: Error) => {
          clearTimeout(timer);
          e ? bad(e) : ok();
        };
        child.on('message', (value) => {
          const m = value as { type: string; message?: string };
          if (m.type === 'ready') finish();
          if (m.type === 'error') finish(new Error(m.message));
        });
        child.once('error', finish);
        child.once('exit', () => finish(new Error('监督器在命令启动前退出')));
      });
    } catch (e) {
      await this.stop();
      throw e;
    }
  }
  /** Kill only the guardian's original child so the guardian can report the
   * actual OS exit signal before group cleanup. Group SIGKILL cannot provide
   * this evidence because it also destroys the reporter. */
  async killApplication(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    const child = this.child;
    if (!child?.connected || !this.running) throw new Error('No live owned application guardian');
    await new Promise<void>((ok, bad) => child.send({ type: 'kill-application' }, e => e ? bad(e) : ok()));
    const until = performance.now() + 3000;
    while (!this.outcome && performance.now() < until) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Guardian exited before reporting application outcome');
      await sleep(10);
    }
    if (!this.outcome) throw new Error('No observed application exit after requested SIGKILL');
    return { ...this.outcome };
  }
  async stop(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = this.stopOwned(signal);
    return this.stopping;
  }
  private async stopOwned(signal: NodeJS.Signals): Promise<void> {
    const child = this.child;
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const kill = (s: NodeJS.Signals) => {
        try {
          process.kill(-child.pid!, s);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e;
        }
      };
      kill(signal);
      if (signal !== 'SIGKILL') {
        const until = performance.now() + 3000;
        while (
          !this.outcome &&
          child.exitCode === null &&
          child.signalCode === null &&
          performance.now() < until
        )
          await sleep(20);
        // The guardian ignores SIGTERM and remains alive, so this is still our group.
        if (child.exitCode === null && child.signalCode === null) kill('SIGKILL');
      }
    }
    if (this.ended) await this.ended;
    await this.writes;
    this.child = undefined;
    this.ended = undefined;
    if (this.writeError) throw this.writeError;
  }
  async runOnce(timeoutMs = 60000): Promise<void> {
    await this.start();
    try {
      const until = performance.now() + timeoutMs;
      while (!this.outcome) {
        if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null)
          throw new Error('进程监督器异常退出');
        if (performance.now() >= until) throw new Error(`命令超时: ${this.command.command}`);
        await sleep(10);
      }
      if (this.outcome.code !== 0)
        throw new Error(
          `命令失败(${this.outcome.code ?? this.outcome.signal}): ${this.command.command}`,
        );
    } finally {
      await this.stop();
    }
  }
}
export async function ownedListener(port: number, owner: OwnedProcess): Promise<boolean> {
  owner.assertRunning();
  let pids: string[];
  try {
    pids = (
      await exec('lsof', ['-n', '-P', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
        env: isolatedEnv({}),
        timeout: 2000,
      })
    ).stdout
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch (e) {
    if ((e as { code?: unknown }).code === 1) return false;
    throw new BlockedError('无法用lsof证明监听端口属于本轮进程；禁止探测可能属于演示的端口');
  }
  if (!pids.length) return false;
  for (const pid of new Set(pids)) {
    if (!/^\d+$/.test(pid)) throw new Error('监听进程ID无效');
    const group = (
      await exec('ps', ['-o', 'pgid=', '-p', pid], { timeout: 2000, env: isolatedEnv({}) })
    ).stdout.trim();
    if (group !== String(owner.pid))
      throw new BlockedError('随机端口被非本轮进程占用；停止且不请求该服务');
  }
  owner.assertRunning();
  return true;
}
export async function waitHttp(
  url: string,
  timeoutMs: number,
  processOwner?: OwnedProcess,
): Promise<void> {
  const target = new URL(url);
  if (target.hostname !== '127.0.0.1' || target.protocol !== 'http:')
    throw new Error('健康探测仅允许隔离loopback地址');
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    processOwner?.assertRunning();
    if (processOwner && !(await ownedListener(Number(target.port), processOwner))) {
      await sleep(100);
      continue;
    }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(750), redirect: 'manual' });
      await r.body?.cancel();
      if (r.ok) {
        processOwner?.assertRunning();
        return;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error(`服务就绪超时: ${url}`);
}
export function isolatedEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {};
  for (const k of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'NVM_BIN', 'SYSTEMROOT'])
    if (process.env[k]) clean[k] = process.env[k];
  return { ...clean, ...extra };
}
