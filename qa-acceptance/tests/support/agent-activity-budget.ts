import assert from 'node:assert/strict';
import { BlockedError } from '../../harness/security.js';
import {
  assertActivityBudget,
  assertNoRecoveryPause,
  type RuntimeEvent,
} from '../../harness/runtime-observation.js';

/** Missing observation cannot prevent the caller checking public behavior.
 * Only evidence-unavailable errors are deferred; real assertion failures survive. */
export async function optionalActivityObservation<T>(
  stage: string,
  read: () => Promise<T>,
  missing: string[],
): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof BlockedError)) throw error;
    missing.push(`${stage}: ${error.message}`);
    return undefined;
  }
}

/** Input events already passed RuntimeLease's owner, run and append-only checks.
 * This no-restart scenario requires true whole-run, single-epoch observation. */
export function assertSingleEpochActivityBudget(
  events: readonly RuntimeEvent[],
  online: [number, number],
  endReason: string,
): void {
  assertNoRecoveryPause(events);
  if (!online.every((value) => Number.isFinite(value) && value >= 0) || online[0] > online[1])
    throw new BlockedError('独立在线区间无效');
  // A missing terminal or an incomplete later sample cannot hide an already
  // proved violation. Online time supplies an upper bound, never activity truth.
  for (const event of events) {
    if (!event.includesUnsavedTail || !event.activeElapsedMs) continue;
    assert.ok(event.activeElapsedMs[0] <= online[1], '活动下界超过独立在线上界，证据矛盾');
    assert.ok(event.activeElapsedMs[0] <= 60_000, '活动预算已证明超过原始60秒上限');
  }
  if (endReason === 'wall_clock')
    assert.ok(online[1] >= 60_000, '独立在线上界尚不足60秒却已提前宣告wall_clock');
  const terminal = events.findLast((event) => event.kind === 'activity-terminal');
  if (!terminal) throw new BlockedError('缺少真实活动终止边界，REST轮询区间不替代活动见证');
  const epochs = new Set(events.flatMap((event) => event.epochIds ?? []));
  if (epochs.size !== 1 || terminal.epochIds?.length !== 1)
    throw new BlockedError('本例缺少完整单epoch创建至终止关联；不推算遗漏或多个所有权段');
  assertActivityBudget(terminal, online, 60_000, endReason);
}
