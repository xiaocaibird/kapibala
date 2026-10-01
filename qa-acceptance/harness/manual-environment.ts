import { readFile, writeFile, appendFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { QaEnvironment } from './environment.js';
import { OwnedDatabaseCluster } from './database.js';
import { loadTarget, requireAuthorization, targetFingerprint, redact } from './security.js';
import { executionPlan } from './execution-plan.js';
import { reviewTargetChanges } from './change-review.js';
import { snapshotQaTree, reportDirectory } from './provenance.js';
import { exec } from './process.js';
import { eventually, type AgentRun, type Group } from './platform-client.js';

// This entry prepares real public fixtures. It never creates a formal execution
// manifest, records manual PASS, or imports observations into a previous run.
const root = fileURLToPath(new URL('../', import.meta.url));
const options = new Map<string, string>();
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]!,
    value = args[i + 1];
  if (
    !['--target', '--authorization', '--out', '--lifetime-ms', '--fixture-set'].includes(key) ||
    options.has(key) ||
    !value ||
    value.startsWith('--')
  )
    throw new Error('Invalid manual environment option');
  options.set(key, value);
}
for (const key of ['--target', '--authorization', '--out'])
  if (!options.get(key)) throw new Error(`Missing ${key}`);
const lifetimeMs = Number(options.get('--lifetime-ms') ?? 5_400_000);
assert.ok(Number.isSafeInteger(lifetimeMs) && lifetimeMs >= 60_000 && lifetimeMs <= 14_400_000);
const fixtureSet = options.get('--fixture-set') ?? 'all';
assert.ok(['all', 'unknown'].includes(fixtureSet), 'Unsupported fixture set');
const plan = await executionPlan(root, 'business-acceptance');
process.env.QA_EXECUTION_KIND = 'business-acceptance';
process.env.QA_EXECUTION_BUSINESS_SHA256 = plan.businessSha256;
delete process.env.QA_EXECUTION_SUITE_ID;
delete process.env.QA_EXECUTION_SUITE_SHA256;
process.env.QA_EXECUTION_AUTHORIZATION = resolve(root, options.get('--authorization')!);
const target = await loadTarget(resolve(root, options.get('--target')!), root);
const authorization = await requireAuthorization(target);
const changeReview = await reviewTargetChanges(root, target);
const requestedOutput = options.get('--out')!;
assert.match(
  requestedOutput,
  /^reports\/manual-followup\/[A-Za-z0-9][A-Za-z0-9_.-]{1,100}$/,
  'Only a new manual-followup session directory is allowed',
);
const parent = await reportDirectory(root, 'reports/manual-followup', true);
const out = resolve(parent, requestedOutput.split('/').at(-1)!);
await mkdir(out); // EEXIST rejects every prior run/package, even without a manifest.
await reportDirectory(root, requestedOutput);
const builtFiles = (
  await readdir(resolve(target.sut.cwd, 'apps/web/dist'), { recursive: true, withFileTypes: true })
)
  .filter((entry) => entry.isFile())
  .map((entry) => resolve(entry.parentPath, entry.name))
  .sort();
assert.ok(builtFiles.length > 0, 'The candidate production frontend must be built');
const builtDigests = await Promise.all(
  builtFiles.map(async (path) => ({
    path: path.slice(target.sut.cwd.length + 1),
    sha256: createHash('sha256')
      .update(await readFile(path))
      .digest('hex'),
  })),
);
const sessionId = randomUUID();
const startedAt = new Date().toISOString();
const tree = await snapshotQaTree(root);
const requirementsSha256 = createHash('sha256')
  .update(await readFile(resolve(target.sut.cwd, 'docs/original-interview-question.md')))
  .digest('hex');
assert.equal(
  requirementsSha256,
  'c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75',
);
await writeFile(
  resolve(out, 'environment-preparation.json'),
  redact({
    schemaVersion: 1,
    kind: 'manual-environment-preparation',
    sessionId,
    startedAt,
    sutRevision: target.sut.revision,
    targetSha256: targetFingerprint(target),
    target,
    qaRevision: (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(),
    qaRoot: root,
    qaDirtyState: (await exec('git', ['status', '--porcelain'], { cwd: root })).stdout,
    frontendBuild: builtDigests,
    frontendBuildSha256: createHash('sha256').update(JSON.stringify(builtDigests)).digest('hex'),
    qaTree: tree,
    authorization,
    executionApproval: {
      scope: authorization.scope,
      approvedBy: authorization.approvedBy,
      approvalReference: authorization.approvalReference,
      approvedAt: authorization.approvedAt,
      expiresAt: authorization.expiresAt,
      targetSha256: authorization.targetSha256,
      businessSha256: authorization.businessSha256,
      allowedActions: authorization.allowedActions,
    },
    changeReview,
    requirementsSha256,
    formalRunId: null,
    productAcceptanceRecorded: false,
    cases: ['MAN-IME-001', 'MAN-FOCUS-001', 'MAN-UX-001'].map((caseId) => ({
      caseId,
      status: 'NOT_RUN',
    })),
    limitation:
      'Live prepared fixtures and raw observations only. No formal human result is recorded by this entry.',
  }),
  { flag: 'wx' },
);
const cluster = new OwnedDatabaseCluster(target.database.image);
const qa = new QaEnvironment(target, cluster, resolve(out, 'environment'));
const fixtures: Record<string, unknown>[] = [];
const event = async (value: Record<string, unknown>) =>
  appendFile(
    resolve(out, 'preparation-events.ndjson'),
    JSON.stringify(JSON.parse(redact({ at: new Date().toISOString(), ...value }))) + '\n',
  );
const tool = (id: string, name: string, input: unknown) => ({
  body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] },
});
const finish = {
  body: { stop_reason: 'end_turn', content: [{ type: 'text', text: '任务已处理' }] },
};
async function group(name: string): Promise<Group> {
  assertPreparing();
  const result = await qa.api.createGroup();
  await qa.api.require(qa.api.patch(`/api/groups/${result.group.id}`, { name }));
  return result.group;
}
async function trigger(group: Group): Promise<AgentRun> {
  assertPreparing();
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: true }));
  qa.gateway.emitMessage({
    groupId: group.gatewayGroupId,
    senderPlatformUserId: 'manual-outside',
    text: '请处理这条测试消息',
  });
  const runs = await eventually(
    () => qa.api.require(qa.api.get<AgentRun[]>(`/api/groups/${group.id}/agent-runs`)),
    (values) => values.length > 0,
  );
  return runs[0]!;
}
async function terminal(group: Group, status: string) {
  const initial = await trigger(group);
  const run = await qa.api.waitFor<AgentRun>(
    `/api/agent-runs/${initial.id}`,
    (r) => r.status !== 'running',
    { timeoutMs: 25_000 },
  );
  assert.equal(run.status, status, 'Prepared fixture must have the real requested public status');
  await qa.api.require(qa.api.patch(`/api/groups/${group.id}`, { agentEnabled: false }));
  return run;
}
async function publish(label: string, group: Group, detail: Record<string, unknown>) {
  const entry = {
    label,
    groupId: group.id,
    gatewayGroupId: group.gatewayGroupId,
    groupUrl: `${qa.webUrl}/#/groups/${group.id}`,
    ...detail,
  };
  fixtures.push(entry);
  await event({ kind: 'fixture-ready', ...entry });
  await writeFile(
    resolve(out, 'fixtures.json'),
    redact({
      sessionId,
      sutRevision: target.sut.revision,
      webUrl: qa.webUrl,
      apiUrl: qa.api.baseUrl,
      fixtures,
      formalAcceptanceResult: null,
    }),
  );
  console.log(JSON.stringify({ kind: 'fixture-ready', ...entry }));
}
let resolveStop!: (reason: string) => void;
let stopRequested: string | undefined;
const lifetimeDeadline = Date.now() + lifetimeMs;
const stopped = new Promise<string>((ok) => {
  resolveStop = ok;
});
const stop = (reason: string) => {
  stopRequested ??= reason;
  resolveStop(stopRequested);
};
const assertPreparing = () => {
  if (stopRequested || Date.now() >= lifetimeDeadline)
    throw new Error(`Preparation stopped: ${stopRequested ?? 'expired'}`);
};
const stopInt = () => stop('SIGINT'),
  stopTerm = () => stop('SIGTERM');
process.on('SIGINT', stopInt);
process.on('SIGTERM', stopTerm);
const timer = setTimeout(() => stop('owned-environment-lifetime-expired'), lifetimeMs);
let preparationError: unknown;
try {
  assertPreparing();
  await cluster.start();
  const databaseResource = JSON.parse(
    (
      await exec('docker', [
        '--host',
        'unix:///var/run/docker.sock',
        'inspect',
        '--format',
        '{"id":{{json .Id}},"name":{{json .Name}},"owner":{{json (index .Config.Labels "qa.owner")}},"mounts":{{json .Mounts}},"ports":{{json .NetworkSettings.Ports}}}',
        cluster.name,
      ])
    ).stdout,
  );
  assert.equal(databaseResource.owner, cluster.owner);
  assert.equal(databaseResource.name, `/${cluster.name}`);
  await event({ kind: 'owned-database-resource', resource: databaseResource });
  assertPreparing();
  await qa.initialize();
  assertPreparing();
  await qa.startWeb();
  await qa.api.login();
  await event({
    kind: 'environment-ready',
    webUrl: qa.webUrl,
    apiUrl: qa.api.baseUrl,
    processBinding: qa.capacityControlTarget(),
    runtimePid: process.pid,
    stopRequestedNoLaterThan: new Date(lifetimeDeadline).toISOString(),
  });

  if (fixtureSet === 'all') {
    const blocked = await group('QA 人工场景 A');
    qa.agent.enqueueAudits(
      { status: 500, rawBody: 'error' },
      { rawBody: 'not json' },
      { body: { verdict: 'unknown' } },
    );
    qa.agent.enqueueTurns(
      tool('manual-audit-block', 'send_message', {
        text: '本条不应实际发送',
        idempotency_key: 'manual-blocked',
      }),
    );
    const blockedRun = await terminal(blocked, 'blocked');
    assert.equal(blockedRun.endReason, 'audit_blocked');
    assert.equal(
      qa.gateway.snapshot().messages.filter((m) => m.text === '本条不应实际发送').length,
      0,
    );
    await publish('A', blocked, {
      run: blockedRun,
      runUrl: `${qa.webUrl}/#/agent-runs/${blockedRun.id}`,
    });

    const normal = await group('QA 人工场景 B');
    qa.agent.enqueueTurns(finish);
    const normalRun = await terminal(normal, 'finished');
    await publish('B', normal, {
      run: normalRun,
      runUrl: `${qa.webUrl}/#/agent-runs/${normalRun.id}`,
    });

    const failed = await group('QA 人工场景 C');
    qa.agent.enqueueTurns(
      { rawBody: 'not JSON' },
      { rawBody: 'not JSON' },
      { rawBody: 'not JSON' },
    );
    const failedRun = await terminal(failed, 'failed');
    assert.equal(failedRun.endReason, 'protocol_errors');
    await publish('C', failed, {
      run: failedRun,
      runUrl: `${qa.webUrl}/#/agent-runs/${failedRun.id}`,
    });

    const cancelled = await group('QA 人工场景 D');
    qa.agent.enqueueTurns({
      ...tool('manual-cancel', 'get_recent_messages', { limit: 1 }),
      barrier: { phase: 'before-response', name: 'manual-cancel-step' },
    });
    const cancelInitial = await trigger(cancelled);
    await qa.agent.barriers.waitFor('manual-cancel-step');
    await qa.api.require(qa.api.patch(`/api/groups/${cancelled.id}`, { agentEnabled: false }));
    qa.agent.barriers.release('manual-cancel-step');
    const cancelRun = await qa.api.waitFor<AgentRun>(
      `/api/agent-runs/${cancelInitial.id}`,
      (r) => r.status !== 'running',
    );
    assert.equal(cancelRun.status, 'cancelled');
    await publish('D', cancelled, {
      run: cancelRun,
      runUrl: `${qa.webUrl}/#/agent-runs/${cancelRun.id}`,
    });

    for (const query of ['测试', '群资料', '空 格']) {
      const item = await group(`QA ${query} 专属目录数据`);
      await publish('IME', item, { finalQuery: query });
    }
  }

  const unknown = await group('QA 人工场景 E');
  qa.gateway.enqueue(`/groups/${unknown.gatewayGroupId}/send`, {
    status: 504,
    code: 'NETWORK_TIMEOUT',
    effect: 'apply',
    omitEvent: true,
    barrier: { phase: 'before-response', name: 'manual-unknown-send' },
  });
  const accounts = await qa.api.accounts();
  const sent = await qa.api.send(
    unknown.id,
    accounts.find((a) => a.status === 'online')!.id,
    '等待外部确认的测试消息',
  );
  await qa.gateway.barriers.waitFor('manual-unknown-send');
  qa.gateway.enqueue(
    `/groups/${unknown.gatewayGroupId}/messages/by-client-id/${sent.clientMsgId}`,
    ...Array.from({ length: 7200 }, () => ({
      method: 'GET',
      status: 503,
      code: 'UNAVAILABLE',
      responseDelayMs: 1000,
    })),
  );
  qa.gateway.barriers.release('manual-unknown-send');
  const messages = await eventually(
    () => qa.api.messages(unknown.id),
    (p) =>
      p.items.some((m) => m.clientMsgId === sent.clientMsgId && m.deliveryStatus === 'unknown'),
  );
  await publish('E', unknown, {
    message: messages.items.find((m) => m.clientMsgId === sent.clientMsgId),
    meaning:
      'unknown belongs to message delivery, not Agent run; finite query fault plans keep this live fixture pending',
    queryFaultProfile: {
      count: 7200,
      status: 503,
      responseDelayMs: 1000,
      recheckBeforeObservation: true,
    },
  });

  await qa.evidence('fixture-external-facts', {
    gateway: qa.gateway.snapshot(),
    agent: qa.agent.snapshot(),
  });
  await event({ kind: 'all-fixtures-ready', fixtureCount: fixtures.length });
  console.log(
    JSON.stringify({
      kind: 'manual-environment-ready',
      sessionId,
      webUrl: qa.webUrl,
      out,
      formalRunId: null,
      userMustUseUninstrumentedBrowser: true,
    }),
  );
  await event({ kind: 'shutdown-requested', reason: await stopped });
} catch (error) {
  preparationError = error;
  try {
    await event({ kind: 'preparation-error', error: String(error) });
  } catch (secondary) {
    console.error('Preparation evidence error; original retained', String(secondary));
  }
  throw error;
} finally {
  clearTimeout(timer);
  process.off('SIGINT', stopInt);
  process.off('SIGTERM', stopTerm);
  const cleanup: string[] = [];
  try {
    await qa.evidence('final-external-facts', {
      gateway: qa.gateway.snapshot(),
      agent: qa.agent.snapshot(),
    });
  } catch (error) {
    cleanup.push(`evidence: ${String(error)}`);
  }
  try {
    await qa.close();
  } catch (error) {
    cleanup.push(`environment: ${String(error)}`);
  }
  try {
    await cluster.close();
  } catch (error) {
    cleanup.push(`cluster: ${String(error)}`);
  }
  try {
    await writeFile(
      resolve(out, 'cleanup.json'),
      redact({
        completedAt: new Date().toISOString(),
        errors: cleanup,
        preparationError: preparationError ? String(preparationError) : null,
        ownedResourcesOnly: true,
      }),
    );
  } catch (error) {
    cleanup.push(`cleanup evidence: ${String(error)}`);
  }
  if (preparationError && cleanup.length)
    console.error('Secondary cleanup errors; original retained', redact(cleanup));
  if (cleanup.length && !preparationError) throw new Error(cleanup.join('; '));
}
