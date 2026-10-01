# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/fixture-boundaries.spec.ts >> [UI-037] 确定性微秒与同时间ID夹具双向跨页无遗漏重复
- Location: tests/system/fixture-boundaries.spec.ts:95:1

# Error details

```
Error: 被测命令已退出，不能借用其他进程的健康端点: node
```

# Test source

```ts
  1   | import { spawn, execFile, type ChildProcess } from 'node:child_process';
  2   | import { promisify } from 'node:util';
  3   | import { appendFile, mkdir } from 'node:fs/promises';
  4   | import { dirname } from 'node:path';
  5   | import { setTimeout as sleep } from 'node:timers/promises';
  6   | import type { Command } from './types.js';
  7   | import { BlockedError, redact } from './security.js';
  8   | 
  9   | export const exec = promisify(execFile);
  10  | // A live guardian owns the detached process group until cleanup. The command may exit,
  11  | // but its PID cannot be recycled into an unrelated group before we reap descendants.
  12  | const guardian = `const {spawn}=require('node:child_process');
  13  | const c=JSON.parse(process.argv[1]); const hold=setInterval(()=>{},1000);
  14  | process.on('SIGTERM',()=>{}); process.on('disconnect',()=>{try{process.kill(-process.pid,'SIGKILL')}catch{process.exit(1)}});
  15  | const p=spawn(c.command,c.args,{stdio:['ignore','inherit','inherit'],env:process.env});
  16  | p.once('spawn',()=>process.send?.({type:'ready'}));
  17  | p.once('error',e=>process.send?.({type:'error',message:e.message}));
  18  | p.once('exit',(code,signal)=>process.send?.({type:'exit',code,signal}));`;
  19  | export class OwnedProcess {
  20  |   private child?: ChildProcess;
  21  |   private writes = Promise.resolve();
  22  |   private writeError?: unknown;
  23  |   private outcome?: { code: number | null; signal: NodeJS.Signals | null };
  24  |   private ended?: Promise<void>;
  25  |   private stopping?: Promise<void>;
  26  |   constructor(
  27  |     readonly command: Command,
  28  |     readonly cwd: string,
  29  |     readonly env: NodeJS.ProcessEnv,
  30  |     readonly log: string,
  31  |   ) {}
  32  |   get pid(): number | undefined {
  33  |     return this.child?.pid;
  34  |   }
  35  |   get exitOutcome(): { code: number | null; signal: NodeJS.Signals | null } | undefined {
  36  |     return this.outcome ? { ...this.outcome } : undefined;
  37  |   }
  38  |   get running(): boolean {
  39  |     return (
  40  |       !!this.child &&
  41  |       this.child.exitCode === null &&
  42  |       this.child.signalCode === null &&
  43  |       !this.outcome
  44  |     );
  45  |   }
  46  |   assertRunning(): void {
  47  |     if (!this.running)
> 48  |       throw new Error(`被测命令已退出，不能借用其他进程的健康端点: ${this.command.command}`);
      |             ^ Error: 被测命令已退出，不能借用其他进程的健康端点: node
  49  |   }
  50  |   async start(): Promise<void> {
  51  |     if (this.child) throw new Error('Owned process already started; stop before restart');
  52  |     await mkdir(dirname(this.log), { recursive: true });
  53  |     this.outcome = undefined;
  54  |     this.writeError = undefined;
  55  |     this.stopping = undefined;
  56  |     const child = spawn(process.execPath, ['-e', guardian, JSON.stringify(this.command)], {
  57  |       cwd: this.cwd,
  58  |       env: this.env,
  59  |       detached: true,
  60  |       stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  61  |     });
  62  |     this.child = child;
  63  |     this.ended = new Promise<void>((ok) => child.once('close', () => ok()));
  64  |     child.on('message', (value) => {
  65  |       const m = value as { type: string; code: number | null; signal: NodeJS.Signals | null };
  66  |       if (m.type === 'exit') this.outcome = { code: m.code, signal: m.signal };
  67  |     });
  68  |     for (const stream of [child.stdout, child.stderr])
  69  |       stream?.on('data', (chunk) => {
  70  |         this.writes = this.writes
  71  |           .then(() => appendFile(this.log, redact(chunk.toString())))
  72  |           .catch((e) => {
  73  |             this.writeError = e;
  74  |           });
  75  |       });
  76  |     try {
  77  |       await new Promise<void>((ok, bad) => {
  78  |         const timer = setTimeout(() => bad(new Error('进程监督器启动超时')), 10000);
  79  |         const finish = (e?: Error) => {
  80  |           clearTimeout(timer);
  81  |           e ? bad(e) : ok();
  82  |         };
  83  |         child.on('message', (value) => {
  84  |           const m = value as { type: string; message?: string };
  85  |           if (m.type === 'ready') finish();
  86  |           if (m.type === 'error') finish(new Error(m.message));
  87  |         });
  88  |         child.once('error', finish);
  89  |         child.once('exit', () => finish(new Error('监督器在命令启动前退出')));
  90  |       });
  91  |     } catch (e) {
  92  |       await this.stop();
  93  |       throw e;
  94  |     }
  95  |   }
  96  |   async stop(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  97  |     if (this.stopping) return this.stopping;
  98  |     this.stopping = this.stopOwned(signal);
  99  |     return this.stopping;
  100 |   }
  101 |   private async stopOwned(signal: NodeJS.Signals): Promise<void> {
  102 |     const child = this.child;
  103 |     if (child?.pid && child.exitCode === null && child.signalCode === null) {
  104 |       const kill = (s: NodeJS.Signals) => {
  105 |         try {
  106 |           process.kill(-child.pid!, s);
  107 |         } catch (e) {
  108 |           if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e;
  109 |         }
  110 |       };
  111 |       kill(signal);
  112 |       if (signal !== 'SIGKILL') {
  113 |         const until = performance.now() + 3000;
  114 |         while (
  115 |           !this.outcome &&
  116 |           child.exitCode === null &&
  117 |           child.signalCode === null &&
  118 |           performance.now() < until
  119 |         )
  120 |           await sleep(20);
  121 |         // The guardian ignores SIGTERM and remains alive, so this is still our group.
  122 |         if (child.exitCode === null && child.signalCode === null) kill('SIGKILL');
  123 |       }
  124 |     }
  125 |     if (this.ended) await this.ended;
  126 |     await this.writes;
  127 |     this.child = undefined;
  128 |     this.ended = undefined;
  129 |     if (this.writeError) throw this.writeError;
  130 |   }
  131 |   async runOnce(timeoutMs = 60000): Promise<void> {
  132 |     await this.start();
  133 |     try {
  134 |       const until = performance.now() + timeoutMs;
  135 |       while (!this.outcome) {
  136 |         if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null)
  137 |           throw new Error('进程监督器异常退出');
  138 |         if (performance.now() >= until) throw new Error(`命令超时: ${this.command.command}`);
  139 |         await sleep(10);
  140 |       }
  141 |       if (this.outcome.code !== 0)
  142 |         throw new Error(
  143 |           `命令失败(${this.outcome.code ?? this.outcome.signal}): ${this.command.command}`,
  144 |         );
  145 |     } finally {
  146 |       await this.stop();
  147 |     }
  148 |   }
```