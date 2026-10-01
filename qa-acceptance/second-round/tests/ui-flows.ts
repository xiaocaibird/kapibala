import assert from 'node:assert/strict';
import type { ResponseGate, UiDriver, UiProfile } from '../contracts/ui-driver.js';

async function releaseRemaining(ui: UiDriver, gate: ResponseGate, hasPrimary: boolean): Promise<void> {
  try {
    await gate.release('unknown');
  } catch (error) {
    if (!hasPrimary) throw error;
    // Keep the original assertion; failure to record cleanup is still visible.
    try {
      await ui.evidence('response-gate-cleanup-error', {
        requestId: gate.requestId,
        errorClass: error instanceof Error ? error.name : typeof error,
        primaryPreserved: true,
      });
    } catch (recordError) {
      process.stderr.write(`QA cleanup evidence failed: ${recordError instanceof Error ? recordError.name : typeof recordError}\n`);
    }
  }
}

/** Response barrier belongs to this actual request and never changes its body.
 * The adapter must preserve normal backend effects and supply network evidence. */
export async function protectLateDraft(
  ui: UiDriver,
  profile: UiProfile,
  variant: 'edited' | 'aba' | 'group' | 'session' | 'failure' | 'unknown' | 'unchanged',
): Promise<void> {
  await ui.login('admin', 'original');
  await ui.openGroup(profile.groupA);
  await ui.editDraft('A');
  const before = await ui.actualSendRequestCount();
  const gate = await ui.holdNextResponse('send');
  let released = false, hasPrimary = false;
  try {
    await ui.clickSend();
    await gate.received;
    if (variant === 'group') await ui.openGroup(profile.groupB);
    if (variant === 'session') {
      await ui.login('admin', 'replacement');
      await ui.openGroup(profile.groupA);
    }
    if (variant !== 'unchanged') await ui.editDraft('B');
    if (variant === 'aba') await ui.editDraft('A');
    const expected = variant === 'aba' ? 'A' : variant === 'unchanged' ? '' : 'B';
    await gate.release(variant === 'failure' || variant === 'unknown' ? variant : 'success');
    released = true;
    await ui.settleResponse(gate.requestId);
    const current = await ui.draft();
    const actual = await ui.actualSendRequestCount();
    await ui.evidence('late-send-draft', { variant, requestId: gate.requestId, current, actual, before });
    assert.equal(current, expected, '旧回执不得清理新的群/会话/修订草稿；原稿未修改才可清理');
    assert.equal(actual - before, 1, '输入保护不得引入未知结果自动重发');
  } catch (error) {
    hasPrimary = true;
    throw error;
  } finally {
    // The owned adapter also implements crash-safe outer fixture teardown.
    if (!released) await releaseRemaining(ui, gate, hasPrimary);
  }
}

export async function protectSequenceClose(ui: UiDriver, profile: UiProfile): Promise<void> {
  assert.ok(profile.closeActions.length > 0, '缺实际支持的关闭入口清单，不能静默跳过');
  assert.equal(new Set(profile.closeActions).size, profile.closeActions.length);
  await ui.newSequence();
  await ui.editSequence(profile.sequenceFields);
  const initial = await ui.sequenceFields();
  for (const action of profile.closeActions) {
    await ui.requestFormClose(action);
    const state = await ui.formState();
    await ui.evidence('dirty-form-close', { action, state });
    assert.equal(state.open, true);
    assert.equal(state.discardPromptVisible, true, '实际脏表单入口必须一致保护');
    await ui.cancelDiscard();
    assert.equal((await ui.formState()).open, true);
    assert.deepEqual(await ui.sequenceFields(), initial, '取消放弃不得清空实际字段');
  }
  const gate = await ui.holdNextResponse('sequence-save');
  let released = false, hasPrimary = false;
  try {
    await ui.saveSequence();
    await gate.received;
    for (const action of profile.closeActions) {
      await ui.requestFormClose(action);
      const state = await ui.formState();
      await ui.evidence('saving-form-close', { action, state, requestId: gate.requestId });
      assert.equal(state.open, true, '保存中不得通过关闭丢失原提交上下文');
      assert.equal(state.saving, true);
      if (state.discardPromptVisible) await ui.cancelDiscard();
    }
    await gate.release('success');
    released = true;
    await ui.settleResponse(gate.requestId);
  } catch (error) {
    hasPrimary = true;
    throw error;
  } finally {
    if (!released) await releaseRemaining(ui, gate, hasPrimary);
  }
  for (const action of profile.closeActions) {
    await ui.newSequence();
    await ui.editSequence(profile.sequenceFields);
    await ui.requestFormClose(action);
    assert.equal((await ui.formState()).discardPromptVisible, true);
    await ui.confirmDiscard();
    assert.equal((await ui.formState()).open, false, '明确放弃应关闭本表单');
  }
}

export async function invalidateLatePrecheck(
  ui: UiDriver,
  profile: UiProfile,
  aba: boolean,
): Promise<void> {
  await ui.setPrecheckContext(profile.precheckInitial);
  const gate = await ui.holdNextResponse('precheck');
  let released = false, hasPrimary = false;
  try {
    await ui.startPrecheck();
    await gate.received;
    await ui.setPrecheckContext(profile.precheckChanged);
    if (aba) await ui.setPrecheckContext(profile.precheckInitial);
    assert.equal(await ui.canConfirmPrecheck(), false);
    await gate.release('success');
    released = true;
    await ui.settleResponse(gate.requestId);
    const canConfirm = await ui.canConfirmPrecheck();
    await ui.evidence('late-precheck', { requestId: gate.requestId, aba, canConfirm });
    assert.equal(canConfirm, false, '群/模板/变量新修订不得由旧预检回包恢复确认，包含ABA');
  } catch (error) {
    hasPrimary = true;
    throw error;
  } finally {
    if (!released) await releaseRemaining(ui, gate, hasPrimary);
  }
}

export async function returnToOrigin(
  ui: UiDriver,
  profile: UiProfile,
  origin: 'group' | 'run-list',
): Promise<void> {
  if (origin === 'group') await ui.openRunFromGroup(profile.groupA, profile.runId);
  else await ui.openRunFromList(profile.groupA, profile.runId);
  const run = await ui.location();
  assert.equal(run.kind, 'run');
  assert.ok(run.title.length > 0 && run.activeNavigation.length > 0);
  await ui.returnToSource();
  const returned = await ui.location();
  await ui.evidence('navigation-origin', { origin, run, returned });
  assert.equal(returned.kind, origin);
  if (origin === 'group') assert.equal(returned.groupId, profile.groupA);
  else assert.equal(returned.selectedGroupId, profile.groupA);
}
