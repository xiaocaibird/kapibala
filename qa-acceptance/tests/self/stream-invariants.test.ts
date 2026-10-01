import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  assertMessageSubset,
  assertUniqueMessages,
  assertReceiptGroup,
  assertHistoryTextHashes,
  messageIdentity,
} from '../../harness/stream-invariants.js';
const content = {
  msgId: 'message-1',
  clientMsgId: null,
  text: '中文😀',
  sentAt: '2026-10-01T00:00:00.000Z',
};
const expected = new Map([
  [messageIdentity(content), { text: content.text, sentAt: content.sentAt }],
]);
test('message namespace, full identity set, every text and optional sentAt remain strict', () => {
  assert.doesNotThrow(() => assertMessageSubset([content], expected));
  assert.throws(
    () => assertUniqueMessages([{ msgId: null, clientMsgId: null }]),
    /stable identity/,
  );
  assert.throws(() => assertMessageSubset([content, content], expected), /Duplicate identity/);
  assert.throws(
    () => assertMessageSubset([{ ...content, msgId: 'wrong' }], expected),
    /Unexpected message/,
  );
  assert.throws(
    () => assertMessageSubset([{ ...content, text: 'changed' }], expected),
    /text differs/,
  );
  assert.throws(
    () => assertMessageSubset([{ ...content, sentAt: 'changed' }], expected),
    /sentAt differs/,
  );
  assert.doesNotThrow(() =>
    assertMessageSubset(
      [{ ...content, sentAt: 'anything' }],
      new Map([[messageIdentity(content), { text: content.text }]]),
    ),
  );
  assert.doesNotThrow(() => assertUniqueMessages([{ msgId: 'same' }, { clientMsgId: 'same' }]));
  assert.throws(
    () =>
      assertUniqueMessages([
        { clientMsgId: 'same', msgId: 'a' },
        { clientMsgId: 'same', msgId: 'b' },
      ]),
    /Duplicate/,
  );
});
test('every received group and ownership field is checked; missing and type-coerced values fail', () => {
  assert.doesNotThrow(() => assertReceiptGroup([{ groupId: 'g', isOwn: false }], 'g', false));
  for (const frame of [
    { groupId: 'other', isOwn: false },
    { groupId: 'g', isOwn: true },
    { groupId: 'g' },
    { isOwn: false },
  ])
    assert.throws(() => assertReceiptGroup([frame], 'g', false));
});
test('history hashes remain per-message and reject changed or unknown entries', () => {
  const hashes = new Map([
    [content.msgId, createHash('sha256').update(content.text).digest('hex')],
  ]);
  assert.doesNotThrow(() => assertHistoryTextHashes([content], hashes));
  assert.throws(
    () => assertHistoryTextHashes([{ ...content, text: 'changed' }], hashes),
    /hash differs/,
  );
  assert.throws(
    () => assertHistoryTextHashes([{ ...content, msgId: 'unknown' }], hashes),
    /hash differs/,
  );
});
test('retained earlier history corruption is checked again in the next complete sample', () => {
  const first = { ...content };
  assertMessageSubset([first], expected);
  first.text = 'changed after previous sample';
  assert.throws(() => assertMessageSubset([first], expected), /text differs/);
  let qaBudgetChecked = false;
  assert.throws(() => {
    assertMessageSubset([first], expected);
    qaBudgetChecked = true;
    throw new Error('QA budget');
  }, /text differs/);
  assert.equal(
    qaBudgetChecked,
    false,
    'observed mismatch still precedes subsequent QA-limit classification',
  );
});
