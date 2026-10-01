import test from 'node:test';
import assert from 'node:assert/strict';
import { executionPurpose } from '../../../harness/security.js';
import { secondRoundCases, secondRoundFingerprint } from '../../harness/scope.js';
import { combineVariants, classifyError } from '../../harness/result.js';
import { latestResults } from '../../harness/report.js';

test('second-round scope uses the one case authority and rejects old execution purpose reuse', async () => {
  const cases = await secondRoundCases();
  assert.equal(cases.length, 112);
  const sha = await secondRoundFingerprint();
  assert.equal(executionPurpose({ QA_EXECUTION_KIND:'second-round', QA_EXECUTION_SECOND_ROUND_SHA256:sha }).phase, 'second-round');
  assert.throws(() => executionPurpose({ QA_EXECUTION_SECOND_ROUND_SHA256:sha }), /不能作为/);
  assert.throws(() => executionPurpose({ QA_EXECUTION_KIND:'second-round', QA_EXECUTION_SECOND_ROUND_SHA256:sha, QA_EXECUTION_SUITE_ID:'smoke' }), /不能混用/);
});
test('partial, missing evidence and later cleanup failure never erase original assertion failure', () => {
  assert.equal(combineVariants([{id:'v1',status:'PASS',evidence:['raw.json']}], ['uncovered']), 'BLOCKED');
  assert.equal(combineVariants([{id:'v1',status:'PASS',evidence:[]}]), 'BLOCKED');
  assert.equal(combineVariants([{id:'v1',status:'FAIL',evidence:['raw.json']}], ['cleanup']), 'FAIL');
  assert.equal(classifyError(new Error('driver/network failure')), 'BLOCKED');
  assert.equal(classifyError(new assert.AssertionError({message:'real business assertion'})), 'FAIL');
  assert.equal(classifyError(Object.assign(new Error('actual UI mismatch'),{matcherResult:{name:'toHaveText',pass:false}})), 'FAIL');
});
test('a fixed report rejects duplicate results rather than replacing the first failure', async () => {
  const cases = await secondRoundCases();
  const fail = {caseId:cases[0].id,status:'FAIL' as const,variants:[{id:'real',status:'FAIL' as const,evidence:['raw.json']}]};
  assert.throws(() => latestResults(cases,[fail,fail]), /distinct retest report/);
  assert.equal(latestResults(cases, [fail]).filter(r=>r.result.status==='NOT_RUN').length, cases.length-1);
});
