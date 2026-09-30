import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  completeCleanup,
  databaseToolCommand,
  transferProcess,
} from '../../harness/recovery-drill.js';
import { assertContract } from '../../contracts/public-api.js';

const runtime = fileURLToPath(new URL('../../.runtime/', import.meta.url));
async function temp(): Promise<string> {
  await mkdir(runtime, { recursive: true });
  return mkdtemp(resolve(runtime, 'recovery-self-'));
}
const database = `qa_${'a'.repeat(24)}`;
const owner = {
  owner: 'owned-test-label',
  port: 15432,
  ownsDatabase: (name: string) => name === database,
};
const inspection = {
  Id: 'f'.repeat(64),
  Config: { Labels: { 'qa.owner': owner.owner } },
  State: { Running: true },
  NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '15432' }] } },
};

test('database command is bound to owned immutable container, Unix socket and DB', () => {
  const command = databaseToolCommand(owner, inspection, database, 'restore');
  assert.equal(command.command, 'docker');
  assert(command.args.includes(inspection.Id));
  assert(command.args.includes('--host=/var/run/postgresql'));
  assert.equal(command.args.at(-1), database);
  assert(command.args.includes('--exit-on-error'));
  assert(command.args.includes('-i'));
});
test('database command rejects unknown DB, mismatched label, remote bind and stopped container', () => {
  assert.throws(() => databaseToolCommand(owner, inspection, 'production', 'dump'));
  assert.throws(() => databaseToolCommand(owner, inspection, `qa_${'b'.repeat(24)}`, 'restore'));
  assert.throws(() =>
    databaseToolCommand(
      owner,
      { ...inspection, Config: { Labels: { 'qa.owner': 'someone-else' } } },
      database,
      'dump',
    ),
  );
  assert.throws(() =>
    databaseToolCommand(owner, { ...inspection, State: { Running: false } }, database, 'dump'),
  );
  assert.throws(() =>
    databaseToolCommand(
      owner,
      {
        ...inspection,
        NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '15432' }] } },
      },
      database,
      'dump',
    ),
  );
});
test('stream output waits for full write and never overwrites an existing artifact', async () => {
  const dir = await temp();
  const file = resolve(dir, 'output');
  try {
    await transferProcess(
      {
        command: process.execPath,
        args: ['-e', 'process.stdout.write("owned-output".repeat(10000))'],
      },
      file,
      'out',
    );
    assert.equal((await readFile(file, 'utf8')).length, 120000);
    await assert.rejects(
      transferProcess({ command: process.execPath, args: ['-e', 'process.exit(91)'] }, file, 'out'),
      /EEXIST/,
    );
    assert.equal((await readFile(file, 'utf8')).length, 120000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('stream input propagates tool exit failure and bounded stderr', async () => {
  const dir = await temp();
  const file = resolve(dir, 'input');
  await writeFile(file, 'abc');
  try {
    await transferProcess(
      {
        command: process.execPath,
        args: [
          '-e',
          'let value="";process.stdin.on("data",x=>value+=x);process.stdin.on("end",()=>process.exit(value==="abc"?0:1))',
        ],
      },
      file,
      'in',
    );
    await assert.rejects(
      transferProcess(
        {
          command: process.execPath,
          args: ['-e', 'process.stderr.write("x".repeat(100000));process.exitCode=23'],
        },
        file,
        'in',
      ),
      /失败|EPIPE|premature/i,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('missing executable and timeout settle and reap only the test child', async () => {
  const dir = await temp();
  try {
    await assert.rejects(
      transferProcess(
        { command: resolve(dir, 'missing-executable'), args: [] },
        resolve(dir, 'missing-output'),
        'out',
      ),
      /ENOENT/,
    );
    const start = Date.now();
    await assert.rejects(
      transferProcess(
        { command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] },
        resolve(dir, 'timeout-output'),
        'out',
        100,
      ),
      /超时/,
    );
    assert(Date.now() - start < 3000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('cleanup attempts every resource even when several actions fail', async () => {
  const actions: string[] = [];
  await assert.rejects(
    completeCleanup([
      async () => {
        actions.push('process');
        throw new Error('process error');
      },
      async () => {
        actions.push('database');
        throw new Error('database error');
      },
      async () => {
        actions.push('backup');
      },
    ]),
    AggregateError,
  );
  assert.deepEqual(actions, ['process', 'database', 'backup']);
});
test('public contract permits extra fields, unknown schemaVersion and malformed tool input evidence', () => {
  assertContract('health', { ok: true, schemaVersion: { freelyDeclaredVersion: 2 }, extra: true });
  assertContract('agentRun', {
    id: 'r',
    groupId: 'g',
    status: 'finished',
    endReason: 'final',
    summary: 'done',
    steps: [
      {
        kind: 'tool_use',
        toolUseId: 't',
        name: 'send_message',
        input: 42,
        resultSummary: 'invalid input',
        isError: true,
        errorCode: 'INVALID_INPUT',
        auditVerdict: null,
        rawResponse: 'raw',
      },
    ],
  });
});
test('public UTC time contract rejects impossible calendar dates and accepts leap day', () => {
  const account = {
    id: 'a',
    status: 'rate_limited',
    platformUserId: 'p',
    rateLimitedUntil: '2024-02-29T00:00:00.000Z',
  };
  assertContract('accounts', [account]);
  assert.throws(() =>
    assertContract('accounts', [{ ...account, rateLimitedUntil: '2025-02-29T00:00:00.000Z' }]),
  );
  assert.throws(() =>
    assertContract('accounts', [{ ...account, rateLimitedUntil: '2024-02-29T08:00:00+08:00' }]),
  );
});
