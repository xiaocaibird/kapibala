import assert from 'node:assert/strict';

export const OFFLINE_CLOSEOUT_IDS = ['SR-C1-005', 'SR-BE-USG-011', 'SR-UI-025'] as const;

/** Validate the narrow selection before dependency preparation or resource creation. */
export function assertCloseoutSelection(args: string[], revision: string, scope: {
  active: boolean; sutRevision: string; offlineCaseIds: string[];
}) {
  assert.equal(scope.active, true);
  assert.equal(revision, scope.sutRevision, 'Closeout must use the exact approved frozen product');
  assert.ok(args.includes('--closeout'), 'This checkout requires the bounded closeout entry');
  assert.ok(args.includes('--headed'), 'UI025 requires actual headed focus');
  const index = args.indexOf('--cases');
  assert.ok(index >= 0 && args[index + 1], 'Explicit three-case closeout selection required');
  const ids = args[index + 1]!.split(',');
  assert.equal(new Set(ids).size, ids.length, 'Duplicate closeout case');
  assert.deepEqual([...ids].sort(), [...OFFLINE_CLOSEOUT_IDS].sort());
  assert.deepEqual([...scope.offlineCaseIds].sort(), [...OFFLINE_CLOSEOUT_IDS].sort());
  const engine = args.includes('--browser') ? args[args.indexOf('--browser') + 1] : 'chromium';
  assert.equal(engine, 'chromium', 'No additional compatibility batch authorized');
}
