import { readFile, realpath, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import type { Authorization, TargetConfig, ExecutionPurpose } from './types.js';

const exec = promisify(execFile);
export class BlockedError extends Error {
  constructor(message: string) {
    super(`[BLOCKED] ${message}`);
    this.name = 'BlockedError';
  }
}
const secretKey =
  /(?:password|passwd|cookie|authorization|access[_-]?token|refresh[_-]?token|owner[_-]?token|resource[_-]?token|api[_-]?key|secret|credential)/i;
function redactText(raw: string): string {
  return String(raw)
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1[REDACTED]@')
    .replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(
      /("[^"\n]*(?:password|passwd|cookie|authorization|access[_-]?token|refresh[_-]?token|owner[_-]?token|resource[_-]?token|api[_-]?key|secret|credential)[^"\n]*"\s*:\s*")[^"\n]*/gi,
      '$1[REDACTED]',
    )
    .replace(
      /([?&](?:access[_-]?token|refresh[_-]?token|token|password|secret|api[_-]?key|cookie|authorization)=)[^&#\s"']*/gi,
      '$1[REDACTED]',
    )
    .replace(/((?:^|\n)(?:set-cookie|cookie|authorization)\s*:\s*)[^\r\n]*/gi, '$1[REDACTED]')
    .replace(
      /(\b(?:[A-Z_]*PASSWORD|[A-Z_]*SECRET|[A-Z_]*TOKEN|API_KEY)=)[^\s\"',;&#]+/gi,
      '$1[REDACTED]',
    );
}
export function redact(value: unknown): string {
  if (typeof value === 'string') return redactText(value);
  return redactText(
    String(
      JSON.stringify(
        value,
        (key, v) =>
          secretKey.test(key) ? '[REDACTED]' : typeof v === 'string' ? redactText(v) : v,
        2,
      ),
    ),
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function targetFingerprint(target: TargetConfig): string {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : record(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  return createHash('sha256')
    .update(JSON.stringify(canonical(target)))
    .digest('hex');
}
export function isWithin(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return (
    rel === '' ||
    (!rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
      rel !== '..' &&
      !isAbsolute(rel))
  );
}
export function validateFixtureArtifactBinding(
  value: unknown,
): asserts value is NonNullable<NonNullable<TargetConfig['adapters']>['fixtureArtifacts']> {
  if (
    !record(value) ||
    typeof value.configPath !== 'string' ||
    !value.configPath.trim() ||
    isAbsolute(value.configPath) ||
    value.configPath.split(/[\\/]/).includes('..') ||
    /[\r\n\0]/.test(value.configPath) ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sha256)
  )
    throw new BlockedError('夹具配置必须绑定QA根内相对路径与完整SHA256');
}
export async function loadTarget(path: string, qaRoot: string): Promise<TargetConfig> {
  const c = JSON.parse(await readFile(path, 'utf8')) as TargetConfig;
  if (c.version !== 1 || !c.sut || !/^[a-f0-9]{40}$/.test(c.sut.revision))
    throw new BlockedError('目标配置必须固定完整 Git SHA');
  if (typeof c.sut.cwd !== 'string') throw new BlockedError('目标目录无效');
  c.sut.cwd = await realpath(resolve(qaRoot, c.sut.cwd));
  for (const cmd of [c.sut.start, c.sut.migrate, c.sut.web]) {
    if (
      !cmd ||
      typeof cmd.command !== 'string' ||
      !cmd.command.trim() ||
      cmd.command.includes('\0') ||
      !Array.isArray(cmd.args) ||
      !cmd.args.every((x) => typeof x === 'string' && !x.includes('\0'))
    )
      throw new BlockedError('启动命令必须是非空 command + args，无 shell 字符串');
  }
  if (
    !c.database?.image ||
    !/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/.test(c.database.image) ||
    !c.ui ||
    !c.release
  )
    throw new BlockedError('目标配置缺少有效 database/ui/release');
  if (!(
    Number.isInteger(c.sut.startupTimeoutMs) &&
    c.sut.startupTimeoutMs >= 1000 &&
    c.sut.startupTimeoutMs <= 120000
  ))
    throw new BlockedError('startupTimeoutMs 范围无效');
  if (
    !record(c.sut.env) ||
    !Object.entries(c.sut.env).every(
      ([k, v]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && typeof v === 'string' && !v.includes('\0'),
    )
  )
    throw new BlockedError('env 必须为合法字符串环境变量');
  for (const k of Object.keys(c.sut.env))
    if (
      /^(QA_.*|DATABASE_URL|GATEWAY_URL|AGENT_URL|PORT|PG.*|DOCKER.*|NODE_OPTIONS|NODE_PATH|LD_.*|DYLD_.*|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|HOME|PATH)$/i.test(
        k,
      )
    )
      throw new BlockedError(`${k} 必须由隔离环境控制`);
  if (c.adapters?.capacityControl !== undefined) {
    const control = c.adapters.capacityControl;
    let url: URL;
    try {
      if (!record(control) || typeof control.url !== 'string') throw new Error('invalid control');
      url = new URL(control.url);
    } catch {
      throw new BlockedError('容量控制器URL无效');
    }
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      typeof control.contractReference !== 'string' ||
      !control.contractReference.trim() ||
      /REQUIRED/.test(control.contractReference)
    )
      throw new BlockedError('容量控制器需显式loopback origin及已确认契约引用');
  }
  if (c.adapters?.fixtureArtifacts !== undefined)
    validateFixtureArtifactBinding(c.adapters.fixtureArtifacts);
  if (!record(c.ui.routes) || !record(c.ui.selectors)) throw new BlockedError('UI适配器格式无效');
  for (const route of Object.values(c.ui.routes))
    if (
      typeof route !== 'string' ||
      !route.startsWith('/') ||
      route.startsWith('//') ||
      route.includes('\\') ||
      /[\r\n\0]/.test(route)
    )
      throw new BlockedError('UI路由只能是当前隔离origin的相对路径');
  return c;
}
export function executionPurpose(env: NodeJS.ProcessEnv = process.env): ExecutionPurpose {
  const phase = env.QA_EXECUTION_KIND ?? 'execution';
  if (phase === 'execution') {
    if (env.QA_EXECUTION_SUITE_ID || env.QA_EXECUTION_SUITE_SHA256)
      throw new BlockedError('正式验收不能携带开发子集环境变量');
    return { phase };
  }
  if (
    phase !== 'developer-preflight' ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(env.QA_EXECUTION_SUITE_ID ?? '') ||
    !/^[a-f0-9]{64}$/.test(env.QA_EXECUTION_SUITE_SHA256 ?? '')
  )
    throw new BlockedError('开发预跑缺少有效子集和内容摘要，或执行用途无效');
  return {
    phase,
    suiteId: env.QA_EXECUTION_SUITE_ID!,
    suiteSha256: env.QA_EXECUTION_SUITE_SHA256!,
  };
}
export function validateAuthorization(
  a: Authorization,
  target: TargetConfig,
  now = Date.now(),
  purpose: ExecutionPurpose = { phase: 'execution' },
): void {
  if (
    a.version !== 1 ||
    a.scope !== (purpose.phase === 'execution' ? 'all-required' : 'developer-preflight') ||
    typeof a.approvedBy !== 'string' ||
    !a.approvedBy.trim() ||
    /REQUIRED/.test(a.approvedBy) ||
    typeof a.approvalReference !== 'string' ||
    !a.approvalReference.trim() ||
    /REQUIRED/.test(a.approvalReference)
  )
    throw new BlockedError('缺少后续用户明确授权的记录');
  if (
    purpose.phase === 'developer-preflight' &&
    (a.suiteId !== purpose.suiteId ||
      a.suiteSha256 !== purpose.suiteSha256 ||
      !/^[a-f0-9]{64}$/.test(purpose.suiteSha256))
  )
    throw new BlockedError('预跑授权未绑定当前 QA 子集及内容摘要');
  if (purpose.phase === 'execution' && (a.suiteId !== undefined || a.suiteSha256 !== undefined))
    throw new BlockedError('正式验收授权不可携带开发子集');
  const from = Date.parse(a.approvedAt),
    until = Date.parse(a.expiresAt);
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(until) ||
    from > now ||
    until <= now ||
    until <= from
  )
    throw new BlockedError('授权未生效或已过期');
  if (a.sutRevision !== target.sut.revision || a.sutDirectory !== target.sut.cwd)
    throw new BlockedError('授权与目标提交/目录不一致');
  if (a.targetSha256 !== targetFingerprint(target))
    throw new BlockedError('授权未绑定当前完整目标配置，或启动命令/环境/路由/门槛已改变');
  for (const action of [
    'start-isolated-sut',
    'create-owned-database',
    'fault-injection',
    'kill-owned-process',
    'browser-automation',
  ]) {
    if (!Array.isArray(a.allowedActions) || !a.allowedActions.includes(action))
      throw new BlockedError(`授权范围缺少 ${action}`);
  }
}
export async function requireAuthorization(target: TargetConfig): Promise<Authorization> {
  const file = process.env.QA_EXECUTION_AUTHORIZATION;
  if (!file)
    throw new BlockedError('尚未授权执行产品验收；仅可运行 test:self/typecheck/check:catalog');
  const a = JSON.parse(await readFile(file, 'utf8')) as Authorization;
  a.sutDirectory = await realpath(a.sutDirectory);
  validateAuthorization(a, target, Date.now(), executionPurpose());
  const workspace = (
    await exec('git', ['rev-parse', '--show-toplevel'], { cwd: target.sut.cwd })
  ).stdout.trim();
  if ((await realpath(workspace)) !== target.sut.cwd)
    throw new BlockedError('目标cwd必须是专属SUT工作树根目录');
  const worktrees = (
    await exec('git', ['worktree', 'list', '--porcelain', '-z'], { cwd: target.sut.cwd })
  ).stdout;
  const primary = worktrees.split('\0')[0]?.replace(/^worktree /, '');
  if (!primary || (await realpath(primary)) === target.sut.cwd)
    throw new BlockedError('禁止从主checkout或演示工作区启动；需冻结候选的独立SUT工作树');
  try {
    await lstat(resolve(target.sut.cwd, '.runtime'));
    throw new BlockedError(
      'SUT根目录含既有.runtime；不得复用或自动清理，请使用新工作树并将运行文件定向QA专属目录',
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const revision = (
    await exec('git', ['rev-parse', 'HEAD'], { cwd: target.sut.cwd })
  ).stdout.trim();
  if (revision !== target.sut.revision)
    throw new BlockedError('SUT HEAD 已变化，需重新冻结目标版本');
  const status = (
    await exec('git', ['status', '--porcelain', '-z', '--untracked-files=all'], {
      cwd: target.sut.cwd,
    })
  ).stdout;
  // Rename records have a second path; reject any such dirty tracked state rather than skipping it.
  if (
    status
      .split('\0')
      .filter(Boolean)
      .some((line) => !/^\?\? qa-acceptance\//.test(line))
  )
    throw new BlockedError('SUT 存在未冻结的变更（只允许独立未跟踪QA目录）');
  return a;
}
