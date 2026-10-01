import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

interface MessageIdentity {
  msgId?: string | null;
  clientMsgId?: string | null;
}
interface MessageContent extends MessageIdentity {
  text: string;
  sentAt?: string;
}

export const messageIdentity = (message: MessageIdentity): string =>
  message.clientMsgId ? `client:${message.clientMsgId}` : `message:${message.msgId}`;

/** Keep full-sample checks. Native assertions avoid one Playwright trace step
 * per already-observed item while the same worker owns the DB/SSE transports. */
export function assertUniqueMessages(items: readonly MessageIdentity[]): void {
  for (const message of items)
    assert.ok(Boolean(message.clientMsgId || message.msgId), 'Message lacks a stable identity');
  assert.equal(
    new Set(items.map(messageIdentity)).size,
    items.length,
    'Duplicate identity in snapshot',
  );
}
export function assertMessageSubset(
  items: readonly MessageContent[],
  expected: ReadonlyMap<string, { text: string; sentAt?: string }>,
): void {
  assertUniqueMessages(items);
  for (const item of items) {
    const value = expected.get(messageIdentity(item));
    assert.ok(value !== undefined, 'Unexpected message identity in snapshot');
    assert.equal(item.text, value.text, `Message text differs for ${messageIdentity(item)}`);
    if (value.sentAt !== undefined)
      assert.equal(
        item.sentAt,
        value.sentAt,
        `Message sentAt differs for ${messageIdentity(item)}`,
      );
  }
}
export function assertReceiptGroup(
  frames: readonly { groupId?: string; isOwn?: boolean }[],
  groupId: string,
  isOwn: boolean,
): void {
  for (const frame of frames) {
    assert.equal(frame.groupId, groupId, 'Received message group differs');
    assert.equal(frame.isOwn, isOwn, 'Received message ownership differs');
  }
}
export function assertHistoryTextHashes(
  items: readonly MessageContent[],
  expected: ReadonlyMap<string, string>,
): void {
  for (const message of items) {
    const digest = createHash('sha256').update(message.text).digest('hex');
    assert.equal(digest, expected.get(message.msgId!), `History hash differs for ${message.msgId}`);
  }
}
