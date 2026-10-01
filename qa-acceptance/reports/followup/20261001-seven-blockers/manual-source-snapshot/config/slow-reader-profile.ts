import assert from 'node:assert/strict';
import type { PeerClosePolicy, ReceiptLimits } from '../harness/receipt-socket.js';

/** QA resource/observation budgets, not product capacity or response-time promises.
 * This authored profile participates in the frozen QA source fingerprint. */
export interface SlowReaderProfile {
  maxMessages: number;
  textPaddingBytes: number;
  maxInjectedTextBytes: number;
  batchSize: number;
  batchIntervalMs: number;
  injectionBudgetMs: number;
  healthyDrainMs: number;
  pausedObservationMs: number;
  closeObservationMs: number;
  replayObservationMs: number;
  historyMaxPages: number;
  historyPageSize: number;
  historyObservationMs: number;
  postReplayObservationMs: number;
  setupAndCleanupMs: number;
  receipts: ReceiptLimits;
  peerClosePolicy: PeerClosePolicy | null;
}

export function validateSlowReaderProfile(profile: SlowReaderProfile): void {
  for (const [key, value] of Object.entries(profile)) {
    if (key === 'receipts' || key === 'peerClosePolicy') continue;
    assert.ok(Number.isSafeInteger(value) && value > 0, `Invalid QA profile ${key}`);
  }
  const { receipts } = profile;
  for (const key of ['maxFrames', 'maxPayloadBytes', 'maxFramePayloadBytes'] as const)
    assert.ok(
      Number.isSafeInteger(receipts[key]) && receipts[key] > 0,
      `Invalid QA receipt ${key}`,
    );
  assert.ok(profile.batchSize <= profile.maxMessages, 'Batch exceeds injection limit');
  assert.ok(
    receipts.maxFrames >= profile.maxMessages + 2,
    'Receipt ledger cannot hold messages, checkpoint and auth',
  );
  assert.ok(
    receipts.maxFramePayloadBytes <= receipts.maxPayloadBytes,
    'Frame exceeds total byte budget',
  );
  assert.ok(profile.historyPageSize === 50, 'History helper uses the public 50-item page size');
  assert.ok(
    profile.historyMaxPages * profile.historyPageSize >= profile.maxMessages + 1,
    'History budget cannot traverse the injected set',
  );
  const largestText =
    Buffer.byteLength(`slow-stream-${profile.maxMessages - 1}:`) + profile.textPaddingBytes;
  assert.ok(Number.isSafeInteger(largestText * profile.maxMessages), 'Injection bytes overflow');
  assert.ok(
    largestText * profile.maxMessages + Buffer.byteLength('checkpoint') <=
      profile.maxInjectedTextBytes,
    'Text workload exceeds the authored injection byte budget',
  );
  if (profile.peerClosePolicy) {
    const policy = profile.peerClosePolicy;
    assert.ok(
      policy.contractReference.trim() && policy.reason.trim(),
      'Close mapping requires published reference and exact reason',
    );
    assert.ok(
      Number.isInteger(policy.code) &&
        (policy.code === 1000 ||
          (policy.code >= 1001 &&
            policy.code <= 1014 &&
            ![1004, 1005, 1006].includes(policy.code)) ||
          (policy.code >= 3000 && policy.code <= 4999)),
      'Close mapping must identify a real peer close frame',
    );
  }
}

export const slowReaderProfile: Readonly<SlowReaderProfile> = Object.freeze({
  maxMessages: 2048,
  textPaddingBytes: 8192,
  maxInjectedTextBytes: 18 * 1024 * 1024,
  batchSize: 32,
  batchIntervalMs: 50,
  injectionBudgetMs: 45000,
  healthyDrainMs: 120000,
  pausedObservationMs: 8000,
  closeObservationMs: 8000,
  replayObservationMs: 15000,
  historyMaxPages: 60,
  historyPageSize: 50,
  historyObservationMs: 30000,
  postReplayObservationMs: 1000,
  setupAndCleanupMs: 45000,
  receipts: Object.freeze({
    maxFrames: 8192,
    maxPayloadBytes: 64 * 1024 * 1024,
    maxFramePayloadBytes: 16 * 1024 * 1024,
  }),
  // No published close code/reason mapping received. Do not invent one.
  peerClosePolicy: null,
});
validateSlowReaderProfile(slowReaderProfile);

export const slowReaderTimeoutMs =
  slowReaderProfile.setupAndCleanupMs +
  slowReaderProfile.injectionBudgetMs +
  slowReaderProfile.healthyDrainMs +
  slowReaderProfile.pausedObservationMs +
  slowReaderProfile.closeObservationMs +
  slowReaderProfile.replayObservationMs +
  slowReaderProfile.historyObservationMs +
  slowReaderProfile.postReplayObservationMs;
