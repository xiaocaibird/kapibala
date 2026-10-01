import { test, expect } from '../fixtures.js';
import { BlockedError } from '../../harness/security.js';
import {
  completeCleanup,
  dumpOwnedDatabase,
  restoreOwnedDatabase,
  launchOwnedDatabase,
} from '../../harness/recovery-drill.js';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { Message, PlatformClient } from '../../harness/platform-client.js';
import { eventually } from '../../harness/platform-client.js';

function positive(value: number | null, name: string): number {
  if (value === null || !Number.isFinite(value) || value <= 0)
    throw new BlockedError(`上线门禁缺少已批准的${name}`);
  return value;
}
function profile(value: string | null): void {
  if (!value?.trim()) throw new BlockedError('上线负载/运行环境profile未批准；不套用任意性能阈值');
}
async function allMessages(api: PlatformClient, groupId: string): Promise<Message[]> {
  const values: Message[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await api.messages(groupId, cursor);
    values.push(...page.items);
    if (!page.nextCursor) break;
    if (cursors.has(page.nextCursor)) throw new Error('消息游标循环，无法核对持久发送记录');
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (true);
  return values;
}
function deadline(limit: number, lower: number, upper: number, label: string): void {
  expect(lower, `${label}的确定下界超过批准门槛`).toBeLessThanOrEqual(limit);
  if (upper > limit)
    throw new BlockedError(
      `${label}测量区间${lower}..${upper}秒跨过批准门槛${limit}秒，不能将保守上界当成确定失败或擅加容差`,
    );
}

test('[OPS-001] 指定并发与混合公开接口负载满足批准指标', async ({ qa }) => {
  const cfg = qa.config.release;
  profile(cfg.approvedProfile);
  const users = positive(cfg.concurrentUsers, 'concurrentUsers'),
    seconds = positive(cfg.durationSeconds, 'durationSeconds'),
    p95Limit = positive(cfg.p95LatencyMs, 'p95LatencyMs');
  if (
    !Number.isInteger(users) ||
    cfg.maxErrorRate === null ||
    !Number.isFinite(cfg.maxErrorRate) ||
    cfg.maxErrorRate < 0 ||
    cfg.maxErrorRate > 1
  )
    throw new BlockedError('并发必须为整数；maxErrorRate必须在0..1');
  test.setTimeout(seconds * 1000 + 120_000);
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const clients = await Promise.all(Array.from({ length: users }, () => qa.api.as('admin')));
  const latencies: number[] = [];
  const acceptedIds: string[] = [];
  const counts = [0, 0, 0, 0];
  let failures = 0,
    total = 0;
  const started = performance.now(),
    end = started + seconds * 1000;
  await Promise.all(
    clients.map(async (client, worker) => {
      let sequence = 0,
        renewed = performance.now();
      while (performance.now() < end) {
        if (performance.now() - renewed > 300_000) {
          await client.login();
          renewed = performance.now();
        }
        if (performance.now() >= end) break;
        const op = sequence++ % 4,
          start = performance.now();
        total++;
        counts[op]!++;
        try {
          const result =
            op === 0
              ? await client.get('/api/accounts')
              : op === 1
                ? await client.get('/api/groups')
                : op === 2
                  ? await client.get(`/api/groups/${group.id}/messages?limit=50`)
                  : await client.post<{ clientMsgId?: string }>(`/api/groups/${group.id}/send`, {
                      accountId: group.creatorAccountId,
                      text: `load-${worker}-${sequence}`,
                    });
          if (result.status !== (op === 3 ? 202 : 200)) failures++;
          else if (op === 3) {
            const id = (result.body as { clientMsgId?: unknown }).clientMsgId;
            if (typeof id !== 'string' || !id) failures++;
            else acceptedIds.push(id);
          }
        } catch {
          failures++;
        } finally {
          latencies.push(performance.now() - start);
        }
      }
    }),
  );
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)]!;
  await qa.evidence('load-metrics', {
    profile: cfg.approvedProfile,
    users,
    seconds,
    observedSeconds: (performance.now() - started) / 1000,
    total,
    failures,
    errorRate: failures / total,
    p95,
    latenciesMs: latencies,
    operationCounts: counts,
    workload:
      '闭环并发客户端，各自按accounts/groups/timeline/send循环；实际比例见计数；网关默认外部延迟；初次登录在计时前，会话续期不计请求延迟',
  });
  expect(total).toBeGreaterThan(0);
  expect(failures / total).toBeLessThanOrEqual(cfg.maxErrorRate);
  expect(p95).toBeLessThanOrEqual(p95Limit);
  expect(new Set(acceptedIds).size).toBe(acceptedIds.length);
  // No product delivery SLA is invented: 30s is an observation cap; expiry is BLOCKED.
  try {
    await eventually(
      async () =>
        qa.gateway.snapshot().messages.filter((message) => message.text.startsWith('load-')),
      (messages) => messages.length >= acceptedIds.length,
      { timeoutMs: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('Condition not reached:'))
      throw error;
    throw new BlockedError(
      '负载后30秒观察窗内仍有消息未确认；该profile尚未约定受理后排空期限，不能以工具观察窗宣判丢失',
    );
  }
  const external = qa.gateway
    .snapshot()
    .messages.filter((message) => message.text.startsWith('load-'));
  expect(external.map((message) => message.clientMsgId).sort()).toEqual([...acceptedIds].sort());
  await qa.api.login();
  const local = (await allMessages(qa.api, group.id)).filter((message) =>
    message.text.startsWith('load-'),
  );
  expect(local.map((message) => message.clientMsgId).sort()).toEqual([...acceptedIds].sort());
  expect(
    local.filter((message) => ['failed', 'cancelled'].includes(message.deliveryStatus)),
  ).toEqual([]);
  if (local.some((message) => message.deliveryStatus !== 'sent'))
    throw new BlockedError(
      '负载停止后的公开消息状态尚未全部确认sent；需要批准的排空窗口或继续取证，不能把外部已发当成本地已持久完成',
    );
  await qa.evidence('load-delivery-reconciliation', { acceptedIds, external, local });
});

test('[OPS-002] 指定持续运行窗口内消息不丢不重且服务持续可用', async ({ qa }) => {
  const cfg = qa.config.release;
  profile(cfg.approvedProfile);
  const seconds = positive(cfg.soakSeconds, 'soakSeconds');
  test.setTimeout(seconds * 1000 + 120_000);
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const started = performance.now(),
    end = started + seconds * 1000;
  let count = 0,
    renewed = performance.now();
  const samples: unknown[] = [],
    sentIds: string[] = [];
  while (performance.now() < end) {
    if (performance.now() - renewed > 300_000) {
      await qa.api.login();
      renewed = performance.now();
    }
    const at = new Date().toISOString(),
      healthStarted = performance.now();
    const health = await qa.api.get<{ ok: boolean }>('/api/health');
    const healthLatencyMs = performance.now() - healthStarted;
    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(true);
    const sendStarted = performance.now();
    const { clientMsgId } = await qa.api.send(group.id, group.creatorAccountId, `soak-${++count}`);
    sentIds.push(clientMsgId);
    try {
      const terminal = await eventually(
        () => qa.api.messages(group.id),
        (value) =>
          value.items.some(
            (message) =>
              message.clientMsgId === clientMsgId &&
              ['sent', 'failed', 'cancelled'].includes(message.deliveryStatus),
          ),
        { timeoutMs: 15_000 },
      );
      expect(
        terminal.items.find((message) => message.clientMsgId === clientMsgId)!.deliveryStatus,
      ).toBe('sent');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('Condition not reached:'))
        throw error;
      throw new BlockedError(
        '持续运行用例中15秒观察窗未见sent；需要排空期限或故障证据，不能按未批准的期限直接宣判丢失',
      );
    }
    expect(
      qa.gateway.snapshot().messages.filter((message) => message.clientMsgId === clientMsgId),
    ).toHaveLength(1);
    samples.push({
      at,
      healthLatencyMs,
      sentObservedLatencyMs: performance.now() - sendStarted,
      clientMsgId,
    });
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1000, Math.max(0, end - performance.now()))),
    );
  }
  const external = qa.gateway
    .snapshot()
    .messages.filter((message) => message.text.startsWith('soak-'));
  const local = (await allMessages(qa.api, group.id)).filter((message) =>
    message.text.startsWith('soak-'),
  );
  expect(external.map((message) => message.clientMsgId).sort()).toEqual([...sentIds].sort());
  expect(local.map((message) => message.clientMsgId).sort()).toEqual([...sentIds].sort());
  expect(local.every((message) => message.deliveryStatus === 'sent')).toBe(true);
  await qa.evidence('soak-metrics', {
    seconds,
    observedSeconds: (performance.now() - started) / 1000,
    count,
    samples,
    limitations:
      '按约1秒间隔执行健康与单发送串行循环；仅证明实际时长和此低速工作负载，不推断容量、内存泄漏或任意长期保证',
  });
});

test('[OPS-003] 真实PostgreSQL备份恢复及公开数据核对', async ({ qa }) => {
  const cfg = qa.config.release;
  profile(cfg.approvedProfile);
  const rto = positive(cfg.rtoSeconds, 'rtoSeconds');
  if (cfg.rpoSeconds === null || !Number.isFinite(cfg.rpoSeconds) || cfg.rpoSeconds < 0)
    throw new BlockedError('缺少已批准rpoSeconds');
  test.setTimeout((rto + 120) * 1000);
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const text = 'backup-preserved-message';
  await qa.api.send(group.id, group.creatorAccountId, text);
  await qa.api.waitFor<{ items: { text: string; deliveryStatus: string }[] }>(
    `/api/groups/${group.id}/messages`,
    (value) =>
      value.items.some((message) => message.text === text && message.deliveryStatus === 'sent'),
  );
  const expectedGroup = await qa.api.group(group.id),
    expectedMessages = await allMessages(qa.api, group.id);
  const backup = resolve(qa.outputDir, `owned-${randomUUID()}.backup`);
  let restored: string | undefined,
    probe: Awaited<ReturnType<typeof launchOwnedDatabase>> | undefined;
  try {
    const artifact = await dumpOwnedDatabase(qa, backup);
    const killStarted = Date.now();
    await qa.kill();
    const killed = Date.now();
    restored = await restoreOwnedDatabase(qa, backup);
    const launchStarted = Date.now();
    probe = await launchOwnedDatabase(qa, restored);
    await probe.ready();
    const observedReady = Date.now();
    await probe.api.login();
    const actualGroup = await probe.api.group(group.id);
    expect(actualGroup).toMatchObject({ ...expectedGroup });
    const messages = await allMessages(probe.api, group.id);
    expect(messages).toEqual(expectedMessages);
    const recoverySeconds = {
      lower: (launchStarted - killed) / 1000,
      upper: (observedReady - killStarted) / 1000,
    };
    const recoveryPointAgeSeconds = {
      lower: Math.max(0, (killStarted - Date.parse(artifact.recoveryPointLatestAt)) / 1000),
      upper: Math.max(0, (killed - Date.parse(artifact.recoveryPointEarliestAt)) / 1000),
    };
    await qa.evidence('backup-restore', {
      artifact,
      recoverySeconds,
      recoveryPointAgeSeconds,
      group: actualGroup,
      messages,
      note: '恢复点为pg_dump实际快照创建时间的区间；只核对本轮静态业务样本与恢复点年龄，不代表生产持续复制、活跃写入恢复或长期RPO保证',
    });
    deadline(rto, recoverySeconds.lower, recoverySeconds.upper, 'RTO');
    deadline(
      cfg.rpoSeconds,
      recoveryPointAgeSeconds.lower,
      recoveryPointAgeSeconds.upper,
      '恢复点年龄',
    );
  } finally {
    await completeCleanup([
      async () => probe?.close(),
      async () => {
        if (restored) await qa.ownedStorage().cluster.dropDatabase(restored);
      },
      () => rm(backup, { force: true }),
    ]);
  }
});
