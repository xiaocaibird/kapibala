import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRuntimeSnapshot, type RuntimeSnapshot } from '../../../../harness/runtime-observation.js';
import { assertAgentLifecycle, assertToolWaitBudget, assertToolWaitCompletion, toolWaitWindow } from '../../../../harness/lifecycle-observation.js';
import { BlockedError } from '../../../../harness/security.js';

// Postmortem of saved files only. No HTTP, product process, database or browser.
// Outputs are exclusive-create; reruns must use a new explicit directory.
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const output = process.argv[2] ? resolve(process.argv[2]) : dirname(fileURLToPath(import.meta.url));
const run = resolve(root, 'reports/preflight/2026-10-01T12-23-10.195Z-e84c34eb');
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const inputs = new Map<string, { path: string; sha256: string; bytes: number }>();
async function read(path: string) {
  const data = await readFile(path);
  inputs.set(path, { path: relative(root, path), sha256: hash(data), bytes: data.length });
  return JSON.parse(data.toString());
}
const paths = {
  agent025: 'system-agent--AGENT-025-ru-6b311-budget-including-slow-turns-system',
  agent028: 'system-agent--AGENT-028-un-e7c9e-ame-key-still-cannot-resend-system',
  external: 'system-protocol-boundaries-390f1-fabricated-two-second-bound-system',
};
const evidence = (kind: keyof typeof paths, name: string) => resolve(run, 'artifacts', paths[kind], 'evidence', name);
const manifest = await read(resolve(run, 'manifest.json'));
const results = await read(resolve(run, 'results.json'));
assert.match(manifest.qaRevision, /^[a-f0-9]{40}$/);
assert.equal(manifest.sutRevision, 'e85ae61496e38bf59e1b7a5cad0146dbfeaf42fb');
const status = (id: string) => results.results.find((item: { id: string }) => item.id === id).status;
assert.equal(status('AGENT-025'), 'FAIL');
assert.equal(status('AGENT-028'), 'FAIL');
assert.equal(status('BLK-EXT-001'), 'BLOCKED');

const helperFiles = ['harness/runtime-observation.ts', 'harness/lifecycle-observation.ts', 'harness/security.ts'];
const helpers = [];
for (const path of helperFiles) {
  const current = await readFile(resolve(root, path));
  const saved = await promisify(execFile)('git', ['-C', root, 'show', `${manifest.qaRevision}:qa-acceptance/${path}`], { encoding: 'buffer' });
  assert.equal(hash(current), hash(saved.stdout), `Analysis helper differs from frozen QA: ${path}`);
  helpers.push({ path, sha256: hash(current), sameAsFrozenQaRevision: true });
}

function validate(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  assert.equal(snapshot.binding.revision, manifest.sutRevision);
  // File-level schema and association check only. No live process ownership
  // revalidation is claimed; original ownership evidence remains in the run.
  return validateRuntimeSnapshot(snapshot, { ...snapshot.binding, ownerToken: snapshot.binding.observedOwnerToken },
    snapshot.leaseId, snapshot.correlation);
}
function check(fn: () => unknown) {
  try { fn(); return { outcome: 'SATISFIED_BY_STORED_EVIDENCE' }; }
  catch (error) {
    return { outcome: error instanceof BlockedError ? 'EVIDENCE_BLOCKED' : 'ASSERTION_FAILED', reason: String(error) };
  }
}
const span = (start: number[], end: number[]) => [end[0]! - start[1]!, end[1]! - start[0]!];

const clock = await read(evidence('agent025', 'wall-clock-window.json'));
const life = validate(clock.lifecycle).events;
const activity = validate(clock.witness).events.findLast((event) => event.kind === 'activity-terminal')!;
const created = life.find((event) => event.kind === 'agent-run-created')!;
const decided = life.find((event) => event.kind === 'agent-termination-decided')!;
const committed = life.find((event) => event.kind === 'agent-terminal-committed')!;
assert.equal(decided.attemptId, committed.attemptId);
assert.equal(activity.clockDomain, created.clockDomain);
assert.equal(activity.includesUnsavedTail, true);
const agent025 = {
  originalStatus: 'FAIL', originalTestStop: 'assertSingleEpochActivityBudget: activity lower bound exceeds 60000ms',
  laterLifecycleAssertionExecutedInOriginalTest: false,
  runId: clock.runId, groupId: clock.groupId, clockDomain: created.clockDomain,
  guardianPid: created.instancePid, applicationPid: created.applicationPid,
  fullActivityMs: activity.activeElapsedMs, epochIds: activity.epochIds,
  creationTransactionWindowMs: created.creationWindowMs, creationInsertWindowMs: created.creationInsertWindowMs,
  terminationDecisionWindowMs: decided.decisionWindowMs,
  transactionToDecisionMs: span(created.creationWindowMs as number[], decided.decisionWindowMs as number[]),
  insertToDecisionMs: span(created.creationInsertWindowMs as number[], decided.decisionWindowMs as number[]),
  decisionToCommitMs: span(decided.decisionWindowMs as number[], committed.monotonicMs as number[]),
  terminalAttemptId: decided.attemptId, terminalStatus: committed.status, terminalReason: committed.reason,
  postmortemLifecycleCheck: check(() => assertAgentLifecycle(life)),
};

const toolSource = await read(evidence('agent028', 'send-timeout-window.json'));
const originalWindow = await read(evidence('agent028', 'send-timeout-actual-interval.json'));
const toolEvents = validate(toolSource.lifecycle).events;
const first = toolWaitWindow(toolEvents, 'send-timeout', 'timeout');
const second = toolWaitWindow(toolEvents, 'same-timeout', 'timeout');
assert.deepEqual(first.elapsed, originalWindow.elapsed);
assert.equal(first.clientMsgId, second.clientMsgId);
assert.notEqual(first.attemptId, second.attemptId);
const describeTool = (window: typeof first, expected: string | null) => ({
  runId: window.runId, stepId: window.stepId, toolUseId: window.toolUseId,
  attemptId: window.attemptId, clientMsgId: window.clientMsgId, keyReused: window.keyReused,
  clockDomain: window.clockDomain, start: window.start, end: window.end, elapsedMs: window.elapsed,
  actualResult: window.result, errorCode: window.errorCode,
  historyIdentity: window.history.map((event) => ({ seq: event.seq, sourceSeq: event.sourceSeq,
    attemptId: event.attemptId, runId: event.runId, stepId: event.stepId, toolUseId: event.toolUseId,
    clockDomain: event.clockDomain, commitBoundary: event.commitBoundary, result: event.result })),
  postmortemTimingCheck: check(() => assertToolWaitBudget(window, expected)),
  postmortemHistoryCheck: check(() => assertToolWaitCompletion(window)),
});
const agent028 = {
  originalStatus: 'FAIL', originalTestStop: 'first actual tool wait lower bound exceeds 5000ms',
  firstHistoryAndSecondToolTimingAssertionsExecutedInOriginalTest: false,
  first: describeTool(first, 'SEND_TIMEOUT'), second: describeTool(second, null),
  boundary: 'Both history checks and second timing judgment below are postmortem analysis, never recorded as original test PASS.',
};

const lands = await read(evidence('external', 'lands-outcome.json'));
const diagnosis = await read(evidence('external', 'lands-recovery-diagnosis.json'));
const message = lands.extra.last.items[0];
const actual = lands.gateway.messages.filter((item: { clientMsgId?: string }) => item.clientMsgId === message.clientMsgId);
assert.equal(message.deliveryStatus, 'sent');
assert.equal(actual.length, 1);
assert.equal(message.msgId, actual[0].msgId);
assert.equal(diagnosis.next.committed.length, 0);
assert.ok(diagnosis.next.received.every((event: { responseStatus: number }) => event.responseStatus === 404));
const external = {
  originalStatus: 'BLOCKED', branch: 'lands', clientMsgId: message.clientMsgId, messageId: message.id, msgId: message.msgId,
  publicObservation: lands.extra, actualLandedMessage: actual[0],
  gatewayPublicEvents: lands.gateway.events.filter((event: { type: string; data: { clientMsgId?: string; msgId?: string } }) =>
    ['message_sent', 'message'].includes(event.type) && event.data.msgId === message.msgId),
  queryCount: diagnosis.next.queries.length, queryHeadersAndBodies: diagnosis.next.received.length,
  allObservedQueryResponsesWere404: true, positiveQueryCommitCount: 0,
  conclusion: 'Public REST observed sent and the independent Gateway recorded the unique matching landed message plus message_sent/echo events. No positive query result was observed. These files do not identify which inbound event the SUT used; do not attribute sent to a positive query.',
  silentBranch: 'Not replaced by this landed branch; original no-terminal-evidence BLOCKED remains unchanged.',
};
for (const [path, entry] of inputs) assert.equal(hash(await readFile(path)), entry.sha256, `Raw file changed during analysis: ${path}`);
const script = fileURLToPath(import.meta.url);
const scriptSha256 = hash(await readFile(script));
const outputData = {
  kind: 'postmortem-saved-evidence-analysis', generatedAt: new Date().toISOString(),
  rawRun: relative(root, run), sourceSutRevision: manifest.sutRevision, sourceQaRevision: manifest.qaRevision,
  originalPhase: manifest.phase, originalResultsModified: false, productExecuted: false,
  originalAssertionsRetroactivelyMarkedPassed: false,
  script: { path: relative(root, script), sha256: scriptSha256 }, helpers, inputs: [...inputs.values()],
  agent025, agent028, external,
};
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'analysis.json'), JSON.stringify(outputData, null, 2) + '\n', { flag: 'wx' });
await writeFile(resolve(output, 'analysis-script.sha256'), `${scriptSha256}  analyze.ts\n`, { flag: 'wx' });
await writeFile(resolve(output, 'README.md'), `# 后端已保存证据事后复核\n\n` +
  `来源：\`${relative(root, run)}\`；SUT \`${manifest.sutRevision}\`；QA \`${manifest.qaRevision}\`。本记录只读取既存 JSON，并使用与冻结 QA 提交相同字节的 helper 做内存验证；没有执行产品、数据库或浏览器，也没有重新验证存活进程归属。原始文件在分析前后摘要一致。\n\n` +
  `**原测试状态不变：AGENT-025 FAIL、AGENT-028 FAIL、BLK-EXT-001 BLOCKED。以下后续校验是事后分析，不是原测试已经执行的断言，不追加或回填 PASS。**\n\n` +
  `| 项目 | 已保存证据的事后结论 | 原执行中断边界 |\n| --- | --- | --- |\n` +
  `| AGENT-025 | 完整活动区间 ${JSON.stringify(agent025.fullActivityMs)}ms；创建事务至实际终止决定 ${JSON.stringify(agent025.transactionToDecisionMs)}ms；INSERT至决定 ${JSON.stringify(agent025.insertToDecisionMs)}ms；决定到COMMIT ${JSON.stringify(agent025.decisionToCommitMs)}ms。同域同run、决定和COMMIT同attempt，仍明确超60000ms。 | 在原activity下界断言失败；后续lifecycle断言未执行。 |\n` +
  `| AGENT-028 第一次 | 等待 ${JSON.stringify(first.elapsed)}ms；attempt \`${first.attemptId}\`；返回和history同run/step/tool/attempt及结果。事后history检查通过，时限检查仍失败。 | 第一次真实等待下界超过5000ms而失败；history断言未执行。 |\n` +
  `| AGENT-028 第二次 | 同clientMsgId \`${second.clientMsgId}\`；keyReused=true，使用独立attempt \`${second.attemptId}\`；等待 ${JSON.stringify(second.elapsed)}ms，返回sent；事后时限及同attempt history检查满足。 | 第二次工具计时/history断言未执行；此前公开同key返回sent、一次审计/发送/落地断言已执行。 |\n` +
  `| BLK-EXT-001 落地分支 | 公开REST见sent；独立Gateway唯一落地 \`${message.msgId}\`，同时记录message_sent及echo。${diagnosis.next.queries.length}次查询的headers/body均404，正向查询提交0条。 | 不能归因正向query；这些文件不能唯一证明SUT采用了哪一条入站事件。静默分支BLOCKED不变。 |\n\n` +
  `详见 [analysis.json](analysis.json) 的区间、身份、每项内存校验结果及全部输入/helper摘要。脚本 [analyze.ts](analyze.ts) 与 [摘要](analysis-script.sha256) 可复核。复跑只能传入新的输出目录，例如从 qa-acceptance 执行 \`node_modules/.bin/tsx reports/followup/20261001-e85ae61-retest/backend-postmortem/analyze.ts <new-output-directory>\`；输出使用exclusive-create，不覆盖既有分析或raw。\n`, { flag: 'wx' });
console.log(JSON.stringify({ output, scriptSha256, originalStatusesUnchanged: true,
  firstToolElapsedMs: first.elapsed, secondToolElapsedMs: second.elapsed,
  firstHistory: agent028.first.postmortemHistoryCheck, secondHistory: agent028.second.postmortemHistoryCheck,
  secondTiming: agent028.second.postmortemTimingCheck }, null, 2));
