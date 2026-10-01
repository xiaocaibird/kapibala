import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invalidateLatePrecheck, protectLateDraft } from '../ui-flows.js';
import type { UiDriver, UiProfile } from '../../contracts/ui-driver.js';

const profile: UiProfile = {
  groupA: 'a', groupB: 'b', runId: 'r', sequenceFields: {}, closeActions: ['cancel'],
  precheckInitial: { group: 'a' }, precheckChanged: { group: 'b' },
};
/** Deliberately wrong/controlled QA-only driver, no browser, network or product. */
function probe(clearNewDraft: boolean, restoreOldPrecheck: boolean): UiDriver {
  let draft = '', requests = 0, canConfirm = false;
  return {
    login: async () => {}, openGroup: async () => {},
    editDraft: async (text) => { draft = text; }, draft: async () => draft,
    actualSendRequestCount: async () => requests,
    holdNextResponse: async (kind) => ({ requestId: kind, received: Promise.resolve(),
      release: async () => { if (clearNewDraft) draft = ''; if (restoreOldPrecheck) canConfirm = true; } }),
    clickSend: async () => { requests++; }, settleResponse: async () => {},
    setPrecheckContext: async () => { canConfirm = false; }, startPrecheck: async () => {},
    canConfirmPrecheck: async () => canConfirm, evidence: async () => {},
    newSequence: async () => { throw new Error('not exercised'); },
    editSequence: async () => { throw new Error('not exercised'); },
    requestFormClose: async () => { throw new Error('not exercised'); },
    cancelDiscard: async () => { throw new Error('not exercised'); },
    formState: async () => { throw new Error('not exercised'); },
    sequenceFields: async () => { throw new Error('not exercised'); },
    confirmDiscard: async () => { throw new Error('not exercised'); },
    saveSequence: async () => { throw new Error('not exercised'); },
    openRunFromGroup: async () => { throw new Error('not exercised'); },
    openRunFromList: async () => { throw new Error('not exercised'); },
    returnToSource: async () => { throw new Error('not exercised'); },
    location: async () => { throw new Error('not exercised'); },
  };
}
test('ABA draft assertion detects a stale receipt clearing the new A', async () => {
  await assert.rejects(protectLateDraft(probe(true, false), profile, 'aba'), assert.AssertionError);
  await protectLateDraft(probe(false, false), profile, 'aba');
});
test('late precheck assertion detects restoring stale confirmation after ABA', async () => {
  await assert.rejects(invalidateLatePrecheck(probe(false, true), profile, true), assert.AssertionError);
  await invalidateLatePrecheck(probe(false, false), profile, true);
});

test('a gate cleanup exception cannot mask the first actual assertion', async () => {
  const ui = probe(false, false);
  let cleanupEvidence = 0;
  ui.canConfirmPrecheck = async () => true;
  ui.holdNextResponse = async () => ({ requestId: 'owned-gate', received: Promise.resolve(),
    release: async () => { throw new Error('QA controlled cleanup failure'); } });
  ui.evidence = async (label) => { if (label === 'response-gate-cleanup-error') cleanupEvidence++; };
  await assert.rejects(invalidateLatePrecheck(ui, profile, false), assert.AssertionError);
  assert.equal(cleanupEvidence, 1);
});
