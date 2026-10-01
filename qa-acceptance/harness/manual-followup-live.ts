import { readFile, realpath, lstat, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { exec, isolatedEnv } from './process.js';
import { BlockedError, isWithin, targetFingerprint } from './security.js';
import type { TargetConfig } from './types.js';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function assert(value: unknown, reason: string): asserts value {
  if (!value) throw new BlockedError(reason);
}
export interface LivePreparationInput {
  rawPreparationDirectory: string;
  fixtureLabels: string[];
}
export function selectManualFixtures(
  labels: string[],
  fixtures: Record<string, unknown>[],
  events: Record<string, unknown>[],
) {
  assert(
    Array.isArray(labels) &&
      labels.length > 0 &&
      labels.every((label) => typeof label === 'string' && label.trim()) &&
      new Set(labels).size === labels.length &&
      Array.isArray(fixtures) &&
      Array.isArray(events),
    '需要明确且不重复的真实fixture标签与准备记录',
  );
  const selected = labels.flatMap((label) => {
    const values = fixtures.filter((item) => item?.label === label);
    assert(values.length > 0, '所选fixture标签没有真实资源');
    for (const value of values) {
      assert(
        typeof value.groupId === 'string' &&
          value.groupId.trim() &&
          events.filter(
            (event) =>
              event?.kind === 'fixture-ready' &&
              event.label === label &&
              event.groupId === value.groupId,
          ).length === 1,
        '每项fixture必须有唯一对应的真实准备事件',
      );
    }
    return values;
  });
  assert(
    new Set(selected.map((item) => item.groupId)).size === selected.length,
    '所选fixture的groupId不得重复',
  );
  return selected;
}
/** The adapter consumes only the QA-owned manual-environment preparation protocol.
 * It does not trust a user-supplied URL, nor infer server version from health JSON. */
export async function verifyLiveManualPreparation(
  root: string,
  target: TargetConfig,
  input: LivePreparationInput,
) {
  const base = await realpath(root),
    raw = await realpath(input.rawPreparationDirectory);
  assert(
    isWithin(base, raw) && raw === resolve(input.rawPreparationDirectory),
    'raw准备包必须位于当前QA根内且非路径别名',
  );
  for (let p = base; p !== raw;) {
    const segment = relative(p, raw).split('/')[0]!;
    p = resolve(p, segment);
    assert(!(await lstat(p)).isSymbolicLink(), 'raw准备路径不得经过符号链接');
  }
  const documents: { name: string; content: Buffer }[] = [];
  for (const name of [
    'environment-preparation.json',
    'preparation-events.ndjson',
    'fixtures.json',
  ]) {
    const path = resolve(raw, name);
    assert(
      (await lstat(path)).isFile() && !(await lstat(path)).isSymbolicLink(),
      'raw准备文件必须是普通文件',
    );
    documents.push({ name, content: await readFile(path) });
  }
  const prep = JSON.parse(documents[0]!.content.toString());
  const events = documents[1]!.content
    .toString()
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const fixtures = JSON.parse(documents[2]!.content.toString());
  const readyEvents = events.filter((event) => event.kind === 'environment-ready');
  assert(readyEvents.length === 1, '需要唯一真实environment-ready记录');
  const ready = readyEvents[0]!;
  assert(
    prep.kind === 'manual-environment-preparation' &&
      prep.formalRunId === null &&
      prep.productAcceptanceRecorded === false &&
      prep.sutRevision === target.sut.revision &&
      prep.targetSha256 === targetFingerprint(target) &&
      prep.target.sut.cwd === target.sut.cwd,
    '准备包类型/候选/目标不一致',
  );
  assert(
    (await realpath(prep.qaRoot)) === resolve(raw, '../../..') &&
      raw === resolve(prep.qaRoot, 'reports/manual-followup', raw.split('/').at(-1)!),
    '准备包与实际QA执行目录不一致',
  );
  assert(
    fixtures.sessionId === prep.sessionId &&
      fixtures.sutRevision === target.sut.revision &&
      fixtures.apiUrl === ready.apiUrl &&
      fixtures.webUrl === ready.webUrl &&
      ready.processBinding?.apiUrl === ready.apiUrl &&
      ready.processBinding?.revision === target.sut.revision,
    '准备包URL/资源/进程绑定不一致',
  );
  const expires = Date.parse(ready.stopRequestedNoLaterThan ?? ready.expiresNoLaterThan);
  assert(Number.isFinite(expires) && Date.now() < expires, '真实环境已过归属租期或缺少租期');
  const selectedFixtures = selectManualFixtures(input.fixtureLabels, fixtures.fixtures, events);
  for (const rawUrl of [ready.apiUrl, ready.webUrl]) {
    const u = new URL(rawUrl);
    assert(
      u.protocol === 'http:' &&
        u.hostname === '127.0.0.1' &&
        u.port &&
        u.port !== '5173' &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        u.pathname === '/',
      '仅允许已记录的独占loopback origin，禁止演示端口',
    );
  }
  async function processIdentity(pid: number) {
    assert(Number.isSafeInteger(pid) && pid > 0, '进程ID缺失');
    const out = (
      await exec('ps', ['-p', String(pid), '-o', 'pid=,ppid=,pgid=,uid=,lstart=,command='], {
        timeout: 2000,
        env: { ...isolatedEnv({}), LC_ALL: 'C' },
      })
    ).stdout.trim();
    const match = out.match(
      /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+([\s\S]+)$/,
    );
    assert(
      match && Number(match[1]) === pid && Number(match[4]) === process.getuid?.(),
      '无法核对进程归属UID/启动时间',
    );
    const cwdLines = (
      await exec('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
        timeout: 2000,
        env: isolatedEnv({}),
      })
    ).stdout.split('\n');
    const cwd = cwdLines.find((line) => line.startsWith('n'))?.slice(1);
    assert(cwd, '无法核对进程cwd');
    return {
      pid,
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      uid: Number(match[4]),
      startedAt: new Date(match[5]!).toISOString(),
      command: match[6]!,
      cwd: await realpath(cwd),
    };
  }
  const owner = await processIdentity(ready.processBinding.pid),
    runtime = await processIdentity(ready.runtimePid);
  assert(
    owner.pgid === owner.pid &&
      owner.ppid === runtime.pid &&
      owner.cwd === target.sut.cwd &&
      owner.command.includes(JSON.stringify(target.sut.start)),
    'API guardian不属于这次raw运行/命令/目录',
  );
  assert(
    runtime.cwd === (await realpath(prep.qaRoot)) &&
      runtime.command.includes('harness/manual-environment.ts'),
    'Web代理进程不属于已冻结raw执行器',
  );
  for (const proc of [owner, runtime])
    assert(Date.parse(proc.startedAt) <= Date.parse(ready.at) + 1000, '进程在ready记录后被替换');
  assert(
    Date.parse(owner.startedAt) >= Date.parse(prep.startedAt) - 1000,
    'guardian并非此次准备创建',
  );
  async function listeners(url: string, expected: number, group: boolean) {
    const pids = [
      ...new Set(
        (
          await exec('lsof', ['-n', '-P', `-iTCP:${new URL(url).port}`, '-sTCP:LISTEN', '-t'], {
            timeout: 2000,
            env: isolatedEnv({}),
          })
        ).stdout
          .trim()
          .split(/\s+/),
      ),
    ];
    assert(pids.length > 0 && pids.every((p) => /^\d+$/.test(p)), 'URL没有可归属的listener');
    const identities = await Promise.all(pids.map((p) => processIdentity(Number(p))));
    assert(
      identities.every((p) =>
        group ? p.pgid === expected && p.cwd === target.sut.cwd : p.pid === expected,
      ),
      '端口属于其他进程，禁止请求',
    );
    return identities;
  }
  const apiListeners = await listeners(ready.apiUrl, owner.pid, true),
    webListeners = await listeners(ready.webUrl, runtime.pid, false);
  async function readOwned(url: string) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
    assert(response.status === 200, `公开就绪读取失败HTTP ${response.status}`);
    const content = Buffer.from(await response.arrayBuffer());
    assert(content.length <= 20_000_000, '就绪读取体积超取证界限');
    return content;
  }
  const health = await readOwned(`${ready.apiUrl}/api/health`);
  const dist = resolve(target.sut.cwd, 'apps/web/dist');
  const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
    .filter((f) => f.isFile())
    .map((f) => resolve(f.parentPath, f.name))
    .sort();
  assert(files.length > 0 && files.length <= 100, 'dist缺失或无法在有限取证内核对');
  const built = [];
  for (const file of files) {
    assert((await realpath(file)) === file, 'dist不能经过符号链接');
    const path = relative(target.sut.cwd, file),
      bytes = await readFile(file),
      digest = hash(bytes);
    const url = `${ready.webUrl}/${relative(dist, file).split('/').map(encodeURIComponent).join('/')}`;
    assert(hash(await readOwned(url)) === digest, '实际提供的前端字节与候选dist不符');
    built.push({ path, sha256: digest });
  }
  assert(
    JSON.stringify(built) === JSON.stringify(prep.frontendBuild) &&
      hash(JSON.stringify(built)) === prep.frontendBuildSha256,
    '前端构建在准备后改变',
  );
  // Recheck ownership after all HTTP reads to reject a changed process during binding.
  const afterOwner = await processIdentity(owner.pid),
    afterRuntime = await processIdentity(runtime.pid);
  assert(
    JSON.stringify(owner) === JSON.stringify(afterOwner) &&
      JSON.stringify(runtime) === JSON.stringify(afterRuntime) &&
      Date.now() < expires,
    '核对期间进程身份/租期改变',
  );
  await listeners(ready.apiUrl, owner.pid, true);
  await listeners(ready.webUrl, runtime.pid, false);
  const gitTree = (
    await exec('git', ['rev-parse', 'HEAD^{tree}'], { cwd: target.sut.cwd, timeout: 2000 })
  ).stdout.trim();
  return {
    documents,
    witness: {
      checkedAt: new Date().toISOString(),
      rawDirectory: raw,
      rawSessionId: prep.sessionId,
      sutRevision: target.sut.revision,
      targetSha256: targetFingerprint(target),
      apiUrl: ready.apiUrl,
      webUrl: ready.webUrl,
      owner,
      runtime,
      apiListeners,
      webListeners,
      expiresAt: new Date(expires).toISOString(),
      frontendBuild: built,
      frontendBuildSha256: hash(JSON.stringify(built)),
      backendSourceGitTree: gitTree,
      health: { status: 200, bodySha256: hash(health) },
      selectedFixtures,
      strength:
        'QA原始准备协议 + 实时PID/PGID/UID/启动时间/命令/cwd + 已归属端口health + 实际提供dist字节；版本来自clean Git HEAD，不宣称health证明版本或密码学防篡改。fixture状态仍需真人开始时观察。',
    },
  };
}
