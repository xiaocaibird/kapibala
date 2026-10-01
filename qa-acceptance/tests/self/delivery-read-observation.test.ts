import test from 'node:test';
import assert from 'node:assert/strict';
import { BlockedError } from '../../harness/security.js';
import {
  ownedPgContainer,
  blockedMessageReaders,
  readerAfterReturn,
  type PgActivity,
  type PgLockSample,
} from '../support/delivery-read-observation.js';
const expected = {
  name: 'qa-acceptance-owned',
  owner: 'owned',
  port: 12345,
  database: `qa_${'a'.repeat(24)}`,
  registered: true,
};
const container = () => ({
  Id: 'b'.repeat(64),
  Name: '/qa-acceptance-owned',
  Config: { Labels: { 'qa.owner': 'owned' } },
  State: { Running: true },
  NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '12345' }] } },
});
test('PG fixture accepts only the registered owned container and loopback binding', () => {
  assert.equal(ownedPgContainer(container(), expected), 'b'.repeat(64));
  for (const change of [
    { owner: 'other' },
    { database: 'postgres' },
    { registered: false },
    { port: 5432 },
  ])
    assert.throws(() => ownedPgContainer(container(), { ...expected, ...change }), BlockedError);
  const foreign = container();
  foreign.Config.Labels['qa.owner'] = 'other';
  assert.throws(() => ownedPgContainer(foreign, expected), BlockedError);
  const publicPort = container();
  publicPort.NetworkSettings.Ports['5432/tcp'][0]!.HostIp = '0.0.0.0';
  assert.throws(() => ownedPgContainer(publicPort, expected), BlockedError);
});
const row = (extra: Partial<PgActivity>): PgActivity => ({
  pid: 41,
  datname: expected.database,
  usename: 'qa',
  application_name: '',
  backend_start: 'start',
  xact_start: 'transaction',
  query_start: 'query',
  state: 'active',
  wait_event_type: 'Lock',
  wait_event: 'relation',
  query: 'select * from public.messages where id=$1',
  blockers: [40],
  relation_locks: [{ relation: 50, mode: 'AccessShareLock', granted: false }],
  ...extra,
});
const owner = {
  database: expected.database,
  lockerPid: 40,
  lockerStart: 'locker-start',
  relationOid: 50,
};
const sample = (readers: PgActivity[] = [row({})]): PgLockSample => ({
  beforeMs: 1,
  afterMs: 2,
  at: 'now',
  database: expected.database,
  activities: [
    row({
      pid: 40,
      backend_start: owner.lockerStart,
      application_name: 'qa-int-read-locker',
      relation_locks: [{ relation: 50, mode: 'AccessExclusiveLock', granted: true }],
    }),
    ...readers,
  ],
});
test('real table lock plus PostgreSQL blocking PID relation is required', () => {
  assert.equal(blockedMessageReaders(sample(), owner).length, 1);
  assert.throws(
    () => blockedMessageReaders(sample(), { ...owner, lockerStart: 'reused' }),
    BlockedError,
  );
  assert.throws(() => blockedMessageReaders(sample(), { ...owner, relationOid: 99 }), BlockedError);
  for (const wrong of [
    { blockers: [99] },
    { datname: 'foreign' },
    { state: 'idle' },
    { wait_event_type: 'Client' },
    { query: 'UPDATE messages SET text=$1' },
    { query: 'select * from accounts' },
    { application_name: 'qa-int-read-observer' },
    { relation_locks: [] },
  ])
    assert.deepEqual(blockedMessageReaders(sample([row(wrong)]), owner), []);
});
test('multiple real readers remain multiple; uniqueness never invents tool attribution', () => {
  assert.equal(blockedMessageReaders(sample([row({}), row({ pid: 42 })]), owner).length, 2);
  // Both are retained, even if their SQL is identical; parameters are not guessed.
});
test('quoted delivered schema locator still identifies a real blocked reader', () => {
  assert.equal(
    blockedMessageReaders(
      sample([row({ query: 'SELECT id FROM "public"."messages" WHERE id=$1' })]),
      owner,
    ).length,
    1,
  );
  assert.equal(
    blockedMessageReaders(
      sample([row({ query: 'SELECT id FROM messages_other WHERE id=$1' })]),
      owner,
    ).length,
    0,
  );
});
test('after-return diagnostics retain open transaction, original query, PID reuse and uncertainty', () => {
  const before = row({});
  assert.equal(
    readerAfterReturn(before, [row({ state: 'idle in transaction (aborted)' })]),
    'idle-transaction-observed',
  );
  assert.equal(readerAfterReturn(before, [row({})]), 'same-query-still-active');
  assert.equal(
    readerAfterReturn(before, [row({ state: 'idle', xact_start: null })]),
    'idle-without-transaction',
  );
  assert.equal(readerAfterReturn(before, []), 'backend-absent');
  assert.equal(
    readerAfterReturn(before, [row({ backend_start: 'new-start' })]),
    'backend-replaced',
  );
  assert.equal(
    readerAfterReturn(before, [row({ query_start: 'new-query' })]),
    'busy-or-reused-not-proven-clean',
  );
});
