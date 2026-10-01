import { test, expect } from '../fixtures.js';
import type { Group, ApiError } from '../../harness/platform-client.js';
import type { QaEnvironment } from '../../harness/environment.js';
import { BlockedError } from '../../harness/security.js';

type Profile = Group & { name: string | null; description: string | null; createdAt: string };
type Directory = { items: Profile[]; nextCursor: string | null };
async function profile(qa: QaEnvironment, name?: string, description?: string): Promise<Profile> {
  const { group } = await qa.api.createGroup();
  if (name !== undefined || description !== undefined)
    await qa.api.require(
      qa.api.patch(`/api/groups/${group.id}`, {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      }),
    );
  return qa.api.require(qa.api.get<Profile>(`/api/groups/${group.id}`));
}
async function directory(qa: QaEnvironment, q: Record<string, string> = {}): Promise<Directory> {
  return qa.api.require(qa.api.get<Directory>(`/api/group-directory?${new URLSearchParams(q)}`));
}

test('[EXT-001] 群资料可选、名称回退基础数据、局部编辑与简介清空', async ({ qa }) => {
  await qa.api.login();
  const initial = await profile(qa);
  expect(initial.name ?? null).toBeNull();
  expect(initial.description ?? null).toBeNull();
  await qa.api.require(
    qa.api.patch(`/api/groups/${initial.id}`, { name: '验收群', description: '第一版简介' }),
  );
  await qa.api.require(qa.api.patch(`/api/groups/${initial.id}`, { description: '第二版简介' }));
  let actual = await qa.api.require(qa.api.get<Profile>(`/api/groups/${initial.id}`));
  expect(actual.name).toBe('验收群');
  expect(actual.description).toBe('第二版简介');
  const clear = await qa.api.patch(`/api/groups/${initial.id}`, { description: '' });
  if (clear.status === 400)
    throw new BlockedError(
      'CL-10: 简介清空必须支持，但空串/null输入契约尚未明确；不能按技术建议判产品失败',
    );
  expect(clear.status).toBe(200);
  actual = await qa.api.require(qa.api.get<Profile>(`/api/groups/${initial.id}`));
  expect(actual.description === null || actual.description === '').toBe(true);
  expect(actual.createdAt).toBe(initial.createdAt);
  expect(
    qa.gateway
      .snapshot()
      .requests.filter((r) => r.path === '/groups')
      .every((r) => !Object.hasOwn(r.body as object, 'name')),
  ).toBe(true);
});
test('[EXT-002] viewer不能修改群资料与原值条件', async ({ qa }) => {
  await qa.api.login();
  const p = await profile(qa, '原名称');
  const viewer = await qa.api.as('viewer');
  const r = await viewer.patch<ApiError>(`/api/groups/${p.id}`, {
    name: '越权',
    expected: { name: '原名称' },
  });
  expect(r.status).toBe(403);
  expect(r.body.error.code).toBe('FORBIDDEN');
  expect((await qa.api.require(qa.api.get<Profile>(`/api/groups/${p.id}`))).name).toBe('原名称');
});
test('[EXT-003] 名称简介及两个ID可搜索，特殊字符按字面匹配', async ({ qa }) => {
  await qa.api.login();
  const a = await profile(qa, 'Mixed CASE 100%_\\ marker', '简介甲  two spaces');
  const b = await profile(qa, '无关记录', '100XX marker');
  for (const q of ['mixed case', '  100%_\\  ', '简介甲', a.id, a.gatewayGroupId, 'two spaces']) {
    const page = await directory(qa, { q });
    expect(page.items.map((x) => x.id)).toContain(a.id);
    expect(page.items.map((x) => x.id)).not.toContain(b.id);
  }
  expect((await directory(qa, { q: 'two  spaces' })).items).toEqual([]);
});
test('[EXT-004] 原群列表数组兼容，目录默认分页与全部页面遍历', async ({ qa }) => {
  await qa.api.login();
  const groups: Profile[] = [];
  for (let i = 0; i < 23; i++) groups.push(await profile(qa, `列表-${i}`));
  expect(Array.isArray(await qa.api.require(qa.api.get('/api/groups')))).toBe(true);
  const first = await directory(qa);
  expect(first.items).toHaveLength(20);
  expect(first.nextCursor).not.toBeNull();
  for (const order of ['asc', 'desc']) {
    const items: Profile[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await directory(qa, { pageSize: '5', order, ...(cursor ? { cursor } : {}) });
      items.push(...page.items);
      cursor = page.nextCursor;
      expect(++pages).toBeLessThan(10);
    } while (cursor);
    expect(new Set(items.map((x) => x.id)).size).toBe(items.length);
    expect(items.map((x) => x.id).sort()).toEqual(groups.map((x) => x.id).sort());
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1]!,
        current = items[i]!;
      if (prev.createdAt === current.createdAt)
        expect(prev.id.localeCompare(current.id)).toBeLessThan(0);
      else
        expect(
          order === 'asc' ? prev.createdAt < current.createdAt : prev.createdAt > current.createdAt,
        ).toBe(true);
    }
  }
});
test('[EXT-005] 目录边界、非法查询和未经授权访问', async ({ qa }) => {
  await qa.api.login();
  const invalidQueries: Record<string, string>[] = [
    { pageSize: '0' },
    { pageSize: '51' },
    { pageSize: '1.5' },
    { order: 'random' },
    { q: 'x'.repeat(501) },
    { q: '\0' },
    { cursor: 'invalid' },
  ];
  for (const query of invalidQueries) {
    const r = await qa.api.get<ApiError>(`/api/group-directory?${new URLSearchParams(query)}`);
    expect(r.status).toBe(400);
    expect(r.body.error.requestId).toBeTruthy();
  }
  expect((await qa.api.get('/api/group-directory', { token: null, cookie: null })).status).toBe(
    401,
  );
  for (const size of ['1', '50'])
    expect((await directory(qa, { pageSize: size })).items.length).toBeLessThanOrEqual(
      Number(size),
    );
});
test('[EXT-006] 游标绑定查询且不能跨身份绕过权限', async ({ qa }) => {
  await qa.api.login();
  await profile(qa, 'QA one');
  await profile(qa, 'QA two');
  const p = await directory(qa, { q: 'QA', pageSize: '1', order: 'asc' });
  expect(p.nextCursor).toBeTruthy();
  const changedQueries: Record<string, string>[] = [
    { q: 'qa' },
    { pageSize: '2' },
    { order: 'desc' },
    { status: 'active' },
    { agentEnabled: 'true' },
  ];
  for (const changed of changedQueries) {
    const r = await qa.api.get(
      `/api/group-directory?${new URLSearchParams({ q: 'QA', pageSize: '1', order: 'asc', cursor: p.nextCursor!, ...changed })}`,
    );
    expect(r.status).toBe(400);
  }
  expect(
    (
      await qa.api.get(
        `/api/group-directory?cursor=${encodeURIComponent(p.nextCursor!)}&q=QA&pageSize=1&order=asc`,
        { token: null, cookie: null },
      )
    ).status,
  ).toBe(401);
});
test('[EXT-007] 群状态和Agent开关组合先过滤再分页', async ({ qa }) => {
  await qa.api.login();
  const enabled = await profile(qa, 'filter-on');
  const disabled = await profile(qa, 'filter-off');
  await qa.api.require(qa.api.patch(`/api/groups/${enabled.id}`, { agentEnabled: true }));
  const p = await directory(qa, {
    q: 'filter',
    status: 'active',
    agentEnabled: 'true',
    pageSize: '1',
  });
  expect(p.items.map((x) => x.id)).toEqual([enabled.id]);
  expect(p.nextCursor).toBeNull();
  expect(
    (await directory(qa, { q: 'filter', agentEnabled: 'false' })).items.map((x) => x.id),
  ).toEqual([disabled.id]);
  const { jobId } = await qa.api.require(
    qa.api.post<{ jobId: string }>(`/api/groups/${disabled.id}/leave-all`),
    202,
  );
  await qa.api.waitJob(jobId);
  expect((await directory(qa, { status: 'left' })).items.map((x) => x.id)).toContain(disabled.id);
  expect((await directory(qa, { status: 'active' })).items.map((x) => x.id)).not.toContain(
    disabled.id,
  );
});
test('[EXT-008] 同字段竞争只一成功，冲突返回当前快照', async ({ qa }) => {
  await qa.api.login();
  const p = await profile(qa, 'original');
  const results = await Promise.all(
    ['one', 'two'].map((name) =>
      qa.api.patch<ApiError>(`/api/groups/${p.id}`, { name, expected: { name: 'original' } }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const conflict = results.find((r) => r.status === 409)!;
  expect(conflict.body.error.code).toBe('GROUP_PROFILE_CONFLICT');
  expect(conflict.body.error.conflictingFields).toEqual(['name']);
  const actual = await qa.api.require(qa.api.get<Profile>(`/api/groups/${p.id}`));
  expect(['one', 'two']).toContain(actual.name);
  expect(conflict.body.error.current).toMatchObject({ name: actual.name });
});
test('[EXT-009] 冲突整请求无资料和开关副作用', async ({ qa }) => {
  await qa.api.login();
  const p = await profile(qa, 'current', 'keep');
  await qa.api.require(qa.api.patch(`/api/groups/${p.id}`, { agentEnabled: true }));
  qa.agent.enqueueTurns({
    barrier: { phase: 'request', name: 'conflict-active-run' },
    body: {
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'conflict-read',
          name: 'get_recent_messages',
          input: { limit: 10 },
        },
      ],
    },
  });
  qa.gateway.emitMessage({
    groupId: p.gatewayGroupId,
    senderPlatformUserId: 'external-conflict',
    text: '验证冲突不能取消正在运行的Agent',
  });
  await qa.agent.barriers.waitFor('conflict-active-run');
  try {
    const active = await qa.api.waitFor<Group>(
      `/api/groups/${p.id}`,
      (value) => value.activeAgentRunId !== null,
    );
    const runId = active.activeAgentRunId!;
    const r = await qa.api.patch<ApiError>(`/api/groups/${p.id}`, {
      name: 'overwritten',
      description: 'changed',
      agentEnabled: false,
      autoKickEnabled: true,
      expected: { name: 'stale', description: 'keep' },
    });
    expect(r.status).toBe(409);
    const actual = await qa.api.require(qa.api.get<Profile>(`/api/groups/${p.id}`));
    expect(actual.name).toBe('current');
    expect(actual.description).toBe('keep');
    expect(actual.agentEnabled).toBe(true);
    expect(actual.autoKickEnabled).toBe(false);
    expect(actual.activeAgentRunId).toBe(runId);
    qa.agent.barriers.release('conflict-active-run');
    const finished = await qa.api.waitFor<{ status: string; endReason: string }>(
      `/api/agent-runs/${runId}`,
      (value) => value.status !== 'running',
    );
    expect(finished.status).toBe('finished');
    expect(finished.endReason).toBe('final');
  } finally {
    qa.agent.barriers.release('conflict-active-run');
  }
});
test('[EXT-010] 不同字段编辑共存，旧调用继续兼容', async ({ qa }) => {
  await qa.api.login();
  const p = await profile(qa, 'A', 'B');
  const rs = await Promise.all([
    qa.api.patch(`/api/groups/${p.id}`, { name: 'A2', expected: { name: 'A' } }),
    qa.api.patch(`/api/groups/${p.id}`, { description: 'B2', expected: { description: 'B' } }),
  ]);
  expect(rs.every((r) => r.status === 200)).toBe(true);
  await qa.api.require(qa.api.patch(`/api/groups/${p.id}`, { name: 'legacy' }));
  const v = await qa.api.require(qa.api.get<Profile>(`/api/groups/${p.id}`));
  expect(v.name).toBe('legacy');
  expect(v.description).toBe('B2');
});
test('[EXT-011] null原值可比较，原值不trim，错误条件组合拒绝', async ({ qa }) => {
  await qa.api.login();
  const p = await profile(qa);
  await qa.api.require(
    qa.api.patch(`/api/groups/${p.id}`, { name: 'A', expected: { name: null } }),
  );
  expect(
    (await qa.api.patch(`/api/groups/${p.id}`, { name: 'B', expected: { name: ' A ' } })).status,
  ).toBe(409);
  for (const expected of [{}, { status: 'active' }, { description: null }, { name: 5 }])
    expect((await qa.api.patch(`/api/groups/${p.id}`, { name: 'C', expected })).status).toBe(400);
  expect((await qa.api.patch(`/api/groups/${p.id}`, { agentEnabled: true })).status).toBe(200);
});
test('[EXT-012] 资料创建时间与条件更新跨重启保留', async ({ qa }) => {
  await qa.api.login();
  const p = await profile(qa, '持久资料', '持久简介');
  await qa.restart();
  await qa.api.login();
  const actual = await qa.api.require(qa.api.get<Profile>(`/api/groups/${p.id}`));
  expect(actual.name).toBe(p.name);
  expect(actual.description).toBe(p.description);
  expect(actual.createdAt).toBe(p.createdAt);
  expect(
    (await qa.api.patch(`/api/groups/${p.id}`, { name: 'new', expected: { name: 'wrong' } }))
      .status,
  ).toBe(409);
});
