import WebSocket from 'ws';
import { test, expect } from '../fixtures.js';
import { eventually, type Account } from '../../harness/platform-client.js';

type Frame = { seq?: number; type: string; payload?: Record<string, unknown>; success?: boolean };
async function socket(baseUrl: string): Promise<{ ws: WebSocket; frames: Frame[] }> {
  const ws = new WebSocket(new URL('/ws', baseUrl).toString().replace(/^http/, 'ws'));
  const frames: Frame[] = [];
  ws.on('message', (raw) => {
    frames.push(JSON.parse(raw.toString()) as Frame);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { ws, frames };
}

test('[WS-001] business events start after auth and have strictly increasing global seq', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  const { ws, frames } = await socket(qa.api.baseUrl);
  try {
    ws.send(JSON.stringify({ type: 'auth', accessToken: qa.api.token }));
    await eventually(
      async () => frames,
      (values) => values.some((frame) => frame.type === 'auth' && frame.success),
    );
    await qa.api.require(
      qa.api.post(`/api/accounts/${accounts[1]!.id}/transition`, {
        expectedFrom: 'online',
        to: 'disconnected',
      }),
    );
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: 'ws-message',
      senderPlatformUserId: 'external',
      text: 'ws payload',
    });
    await eventually(
      async () => frames,
      (values) =>
        values.some((frame) => frame.type === 'message' && frame.payload?.msgId === 'ws-message'),
    );
    const events = frames.filter((frame) => typeof frame.seq === 'number');
    expect(events.length).toBeGreaterThanOrEqual(2);
    for (let index = 1; index < events.length; index++)
      expect(events[index]!.seq!).toBeGreaterThan(events[index - 1]!.seq!);
    const changed = events.find(
      (frame) =>
        frame.type === 'account_status_changed' && frame.payload?.accountId === accounts[1]!.id,
    )!;
    expect(changed.payload).toMatchObject({
      accountId: accounts[1]!.id,
      from: 'online',
      to: 'disconnected',
    });
    expect(
      (await qa.api.accounts()).find((account) => account.id === accounts[1]!.id)!.status,
    ).toBe('disconnected');
    expect(events.find((frame) => frame.type === 'message')!.payload).toMatchObject({
      groupId: group.id,
      msgId: 'ws-message',
      isOwn: false,
    });
    await qa.evidence('websocket-frames', frames);
  } finally {
    ws.close();
  }
});

test('[WS-002] unauthenticated and invalid-token sockets receive no business events', async ({
  qa,
}) => {
  await qa.api.login();
  const { group } = await qa.api.createGroup();
  const anonymous = await socket(qa.api.baseUrl);
  const invalid = await socket(qa.api.baseUrl);
  try {
    invalid.ws.send(JSON.stringify({ type: 'auth', accessToken: 'invalid' }));
    qa.gateway.emitMessage({
      groupId: group.gatewayGroupId,
      msgId: 'secret-event',
      senderPlatformUserId: 'external',
      text: 'not public',
    });
    await eventually(
      () => qa.api.messages(group.id),
      (value) => value.items.some((message) => message.msgId === 'secret-event'),
    );
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    for (const value of [anonymous, invalid]) {
      expect(value.frames.filter((frame) => typeof frame.seq === 'number')).toEqual([]);
      expect(value.frames.some((frame) => frame.type === 'auth' && frame.success)).toBe(false);
    }
  } finally {
    anonymous.ws.close();
    invalid.ws.close();
  }
});

test('[WS-003] account_terminal is published only after terminal state and cleanup', async ({
  qa,
}) => {
  await qa.api.login();
  const { group, accounts } = await qa.api.createGroup();
  const { ws, frames } = await socket(qa.api.baseUrl);
  try {
    ws.send(JSON.stringify({ type: 'auth', accessToken: qa.api.token }));
    await eventually(
      async () => frames,
      (values) => values.some((frame) => frame.type === 'auth' && frame.success),
    );
    const observations: Promise<{ accounts: Account[]; memberPresent: boolean }>[] = [];
    ws.on('message', (raw) => {
      const frame = JSON.parse(raw.toString()) as Frame;
      if (frame.type === 'account_terminal' && frame.payload?.accountId === accounts[1]!.id)
        observations.push(
          Promise.all([qa.api.accounts(), qa.api.group(group.id)]).then(([current, value]) => ({
            accounts: current,
            memberPresent: value.members.some((member) => member.accountId === accounts[1]!.id),
          })),
        );
    });
    qa.gateway.emitStatus(accounts[1]!.id, 'session_expired');
    await eventually(
      async () => observations.length,
      (count) => count > 0,
    );
    for (const observation of await Promise.all(observations)) {
      expect(observation.accounts.find((account) => account.id === accounts[1]!.id)!.status).toBe(
        'session_expired',
      );
      expect(observation.memberPresent).toBe(false);
    }
    expect(frames.find((frame) => frame.type === 'account_terminal')!.payload).toMatchObject({
      accountId: accounts[1]!.id,
      status: 'session_expired',
    });
  } finally {
    ws.close();
  }
});
