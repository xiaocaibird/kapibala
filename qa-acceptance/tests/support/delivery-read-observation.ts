import { BlockedError } from '../../harness/security.js';

export interface OwnedPgExpectation {
  name: string;
  owner: string;
  port: number;
  database: string;
  registered: boolean;
}
/** No credentials or SQL are accepted from the inspected object. */
export function ownedPgContainer(raw: unknown, expected: OwnedPgExpectation): string {
  const value = raw as {
    Id?: string;
    Name?: string;
    Config?: { Labels?: Record<string, string> };
    State?: { Running?: boolean };
    NetworkSettings?: { Ports?: Record<string, { HostIp: string; HostPort: string }[]> };
  };
  const ports = value?.NetworkSettings?.Ports?.['5432/tcp'];
  if (
    !expected.registered ||
    !/^qa_[a-f0-9]{24}$/.test(expected.database) ||
    expected.name !== `qa-acceptance-${expected.owner}` ||
    value?.Name !== `/${expected.name}` ||
    !/^[a-f0-9]{64}$/.test(value.Id ?? '') ||
    value.Config?.Labels?.['qa.owner'] !== expected.owner ||
    !value.State?.Running ||
    ports?.length !== 1 ||
    ports[0]?.HostIp !== '127.0.0.1' ||
    Number(ports[0]?.HostPort) !== expected.port
  )
    throw new BlockedError('PG表锁夹具归属/注册数据库/容器/唯一回环端口不匹配');
  return value.Id!;
}

export interface PgActivity {
  pid: number;
  datname: string;
  usename: string;
  application_name: string;
  backend_start: string;
  xact_start: string | null;
  query_start: string | null;
  state: string;
  wait_event_type: string | null;
  wait_event: string | null;
  query: string;
  blockers: number[];
  relation_locks: { relation: number; mode: string; granted: boolean }[];
}
export interface PgLockSample {
  beforeMs: number;
  afterMs: number;
  at: string;
  database: string;
  activities: PgActivity[];
}

/** A real wait relation is evidence of fault placement, not a result oracle or
 * proof that this is waitForDelivery rather than another product reader. */
export function blockedMessageReaders(
  sample: PgLockSample,
  owner: { database: string; lockerPid: number; lockerStart: string; relationOid: number },
): PgActivity[] {
  const locker = sample.activities.find((row) => row.pid === owner.lockerPid);
  if (
    sample.database !== owner.database ||
    !locker ||
    locker.backend_start !== owner.lockerStart ||
    locker.datname !== owner.database ||
    !locker.relation_locks.some(
      (lock) =>
        lock.relation === owner.relationOid && lock.granted && lock.mode === 'AccessExclusiveLock',
    )
  )
    throw new BlockedError('真实locker身份或ACCESS EXCLUSIVE持锁未证实');
  return sample.activities.filter(
    (row) =>
      row.pid !== owner.lockerPid &&
      row.datname === owner.database &&
      row.usename === 'qa' &&
      !row.application_name.startsWith('qa-int-read-') &&
      row.state === 'active' &&
      row.wait_event_type === 'Lock' &&
      row.blockers.includes(owner.lockerPid) &&
      /^\s*select\b/i.test(row.query) &&
      /\b(?:from|join)\s+(?:"?public"?\.)?"?messages"?(?=\s|$)/i.test(row.query) &&
      row.relation_locks.some(
        (lock) =>
          lock.relation === owner.relationOid && !lock.granted && lock.mode === 'AccessShareLock',
      ),
  );
}

/** Same backend/query identity, never PID alone. Diagnostic classification only:
 * even an idle sample cannot certify an unobserved ROLLBACK ordering. */
export function readerAfterReturn(before: PgActivity, rows: readonly PgActivity[]) {
  const after = rows.find((row) => row.pid === before.pid);
  if (!after) return 'backend-absent' as const;
  if (after.backend_start !== before.backend_start) return 'backend-replaced' as const;
  if (after.state.startsWith('idle in transaction')) return 'idle-transaction-observed' as const;
  if (after.state === 'idle' && after.xact_start === null)
    return 'idle-without-transaction' as const;
  if (after.query_start === before.query_start && after.query === before.query)
    return 'same-query-still-active' as const;
  return 'busy-or-reused-not-proven-clean' as const;
}
