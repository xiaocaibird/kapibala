import test from 'node:test';
import assert from 'node:assert/strict';
import { assertContract, assertGroupMemberIdentities } from '../../contracts/public-api.js';

test('独立契约允许额外字段，但拒绝必需字段遗漏与错误类型', () => {
  assert.doesNotThrow(() =>
    assertContract('health', { ok: true, schemaVersion: 3, extra: 'allowed' }),
  );
  assert.throws(() => assertContract('health', { ok: true }));
  assert.throws(() => assertContract('health', { ok: 'true', schemaVersion: 3 }));
  assert.doesNotThrow(() =>
    assertContract('accounts', [
      { id: 'a', status: 'idle', platformUserId: null, rateLimitedUntil: null },
    ]),
  );
  assert.throws(() =>
    assertContract('accounts', [
      { id: 'a', status: 'invented', platformUserId: null, rateLimitedUntil: null },
    ]),
  );
  assert.throws(() =>
    assertContract('accounts', [
      { id: 'a', status: 'online', platformUserId: 'p', rateLimitedUntil: 'yesterday' },
    ]),
  );
});
test('独立错误契约要求关联ID；不限定未承诺的额外业务字段', () => {
  assert.doesNotThrow(() =>
    assertContract('error', {
      error: {
        code: 'UNRESOLVED_PLACEHOLDER',
        message: 'x',
        requestId: 'r',
        stepIndex: 3,
        key: 'x',
      },
    }),
  );
  assert.throws(() => assertContract('error', { error: { code: 'UNAUTHORIZED', message: 'x' } }));
});

test('D042 accepts external member encodings while retaining managed identity constraints', () => {
  const accounts = [
    {
      id: 'managed',
      status: 'online' as const,
      platformUserId: 'platform-managed',
      rateLimitedUntil: null,
    },
  ];
  const group = {
    id: 'g',
    gatewayGroupId: 'gw',
    status: 'left' as const,
    creatorAccountId: 'managed',
    agentEnabled: false,
    autoKickEnabled: false,
    activeAgentRunId: null,
    activeSequenceRunId: null,
    members: [{ platformUserId: 'external', role: 'member' as const }],
  };
  for (const accountId of [undefined, null, 'external-placeholder']) {
    const value = {
      ...group,
      members: [{ ...group.members[0]!, ...(accountId === undefined ? {} : { accountId }) }],
    };
    assert.doesNotThrow(() => assertContract('group', value));
    assert.doesNotThrow(() => assertGroupMemberIdentities(value, accounts));
  }
  assert.throws(() =>
    assertGroupMemberIdentities(
      { ...group, members: [{ ...group.members[0]!, accountId: 'managed' }] },
      accounts,
    ),
  );
  assert.throws(() =>
    assertGroupMemberIdentities(
      { ...group, members: [{ platformUserId: 'platform-managed', role: 'member' }] },
      accounts,
    ),
  );
  assert.doesNotThrow(() =>
    assertGroupMemberIdentities(
      {
        ...group,
        members: [{ platformUserId: 'platform-managed', role: 'member', accountId: 'managed' }],
      },
      accounts,
    ),
  );
  assert.throws(() =>
    assertContract('group', {
      ...group,
      members: [{ platformUserId: 'external', role: 'member', accountId: 1 }],
    }),
  );
});
