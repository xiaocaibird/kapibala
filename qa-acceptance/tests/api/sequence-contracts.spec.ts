import { test, expect } from '../fixtures.js';
import type { ApiError, ApiResult, SequenceRun } from '../../harness/platform-client.js';
import { assertContract } from '../../contracts/public-api.js';

// Independent examples from B1 and the approved strict-input behavior in D036.
// Product schemas and their tests are intentionally not imported as an oracle.
const definition = () => ({
  name: 'QA independent sequence contract',
  steps: [{ index: 1, accountRole: 'admin', text: 'QA valid sequence', delaySeconds: 1 }],
});
function rejected(result: ApiResult<ApiError>): void {
  expect(result.status).toBe(400);
  assertContract('error', result.body);
  expect(result.body.error.code).toBe('VALIDATION_ERROR');
}

test('[ARC-API-001] 序列定义拒绝额外字段、非法类型和不连续步号', async ({ qa }) => {
  await qa.api.login();
  const valid = definition();
  const invalid: { label: string; body: unknown }[] = [
    { label: 'top-level extra field', body: { ...valid, unexpected: true } },
    {
      label: 'step extra field',
      body: { ...valid, steps: [{ ...valid.steps[0], unexpected: true }] },
    },
    {
      label: 'first index is not one',
      body: { ...valid, steps: [{ ...valid.steps[0], index: 2 }] },
    },
    {
      label: 'index gap',
      body: { ...valid, steps: [valid.steps[0], { ...valid.steps[0], index: 3 }] },
    },
    { label: 'duplicate index', body: { ...valid, steps: [valid.steps[0], valid.steps[0]] } },
    {
      label: 'index is not an integer',
      body: { ...valid, steps: [{ ...valid.steps[0], index: 1.5 }] },
    },
    {
      label: 'unknown role',
      body: { ...valid, steps: [{ ...valid.steps[0], accountRole: 'owner' }] },
    },
    {
      label: 'negative delay',
      body: { ...valid, steps: [{ ...valid.steps[0], delaySeconds: -1 }] },
    },
    { label: 'name is not text', body: { ...valid, name: 123 } },
    { label: 'empty steps', body: { ...valid, steps: [] } },
    { label: 'steps is not array', body: { ...valid, steps: {} } },
    { label: 'null definition', body: null },
  ];
  for (const item of invalid)
    await test.step(item.label, async () => {
      const result = await qa.api.post<ApiError>('/api/sequences', item.body);
      await qa.evidence(`contract-definition-${invalid.indexOf(item)}`, { input: item, result });
      rejected(result);
    });
  const created = await qa.api.require(qa.api.post<{ id: string }>('/api/sequences', valid));
  expect(created.id).toEqual(expect.any(String));
  expect(created.id.length).toBeGreaterThan(0);
  expect(qa.gateway.snapshot().requests.filter((r) => r.path.endsWith('/send'))).toHaveLength(0);
});

test('[ARC-API-002] 启动参数拒绝类型与键错误且失败后合法请求可执行', async ({ qa }) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const { id } = await qa.api.require(qa.api.post<{ id: string }>('/api/sequences', definition()));
  const valid = { sequenceId: id, vars: {}, stepVars: {} };
  const invalid: { label: string; body: unknown }[] = [
    { label: 'top-level extra field', body: { ...valid, unexpected: true } },
    { label: 'vars array', body: { ...valid, vars: [] } },
    { label: 'vars null', body: { ...valid, vars: null } },
    { label: 'variable name outside grammar', body: { ...valid, vars: { 'invalid-key': 'x' } } },
    { label: 'variable value is number', body: { ...valid, vars: { valid: 42 } } },
    { label: 'stepVars array', body: { ...valid, stepVars: [] } },
    { label: 'step key is zero', body: { ...valid, stepVars: { '0': { valid: 'x' } } } },
    {
      label: 'step key has a leading zero',
      body: { ...valid, stepVars: { '01': { valid: 'x' } } },
    },
    { label: 'step key is not numeric', body: { ...valid, stepVars: { later: { valid: 'x' } } } },
    { label: 'nested value is not text', body: { ...valid, stepVars: { '1': { valid: false } } } },
    { label: 'missing sequence identity', body: { vars: {}, stepVars: {} } },
  ];
  for (const item of invalid)
    await test.step(item.label, async () => {
      rejected(await qa.api.post<ApiError>(`/api/groups/${group.id}/sequence-runs`, item.body));
      expect((await qa.api.group(group.id)).activeSequenceRunId).toBeNull();
    });
  const started = await qa.api.post<{ runId: string }>(
    `/api/groups/${group.id}/sequence-runs`,
    valid,
  );
  expect(started.status).toBe(201);
  const run = await qa.api.waitFor<SequenceRun>(
    `/api/sequence-runs/${started.body.runId}`,
    (run) => run.status !== 'running',
  );
  expect(run.status).toBe('finished');
  expect(qa.gateway.snapshot().messages.map((m) => m.text)).toEqual(['QA valid sequence']);
  expect(qa.gateway.snapshot().requests.filter((r) => r.path.endsWith('/send'))).toHaveLength(1);
});

test('[ARC-API-003] 缺省变量对象与显式空对象兼容', async ({ qa }) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const { id } = await qa.api.require(qa.api.post<{ id: string }>('/api/sequences', definition()));
  for (const payload of [
    { sequenceId: id },
    { sequenceId: id, vars: {} },
    { sequenceId: id, stepVars: {} },
  ]) {
    const response = await qa.api.post<{ runId: string }>(
      `/api/groups/${group.id}/sequence-runs`,
      payload,
    );
    expect(response.status).toBe(201);
    const run = await qa.api.waitFor<SequenceRun>(
      `/api/sequence-runs/${response.body.runId}`,
      (run) => run.status !== 'running',
    );
    expect(run.status).toBe('finished');
    expect(run.steps[0]!.resolvedVars).toEqual({});
    expect(run.steps[0]!.varSources).toEqual({});
  }
  expect(qa.gateway.snapshot().messages.map((m) => m.text)).toEqual(
    Array(3).fill('QA valid sequence'),
  );
});
