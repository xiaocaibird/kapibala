import test from 'node:test';
import assert from 'node:assert/strict';
import { assertScopedBlockedCopy, assertTerminalEmptyCopy } from './draft-support.js';
test('本次工具与前序步骤均保留语义，可接受公开交接中文与等价英文', () => {
  assert.doesNotThrow(() => assertScopedBlockedCopy('本次工具的审计未得到明确结论，未执行其副作用。此前步骤可能已执行。'));
  assert.doesNotThrow(() => assertScopedBlockedCopy('This tool was blocked before its side effect; earlier completed steps are not rolled back.'));
});
test('旧全run无副作用或混入回滚保证仍失败', () => {
  assert.throws(() => assertScopedBlockedCopy('The run is blocked; no side effect was executed.'));
  assert.throws(() => assertScopedBlockedCopy('本次工具未执行。此前步骤可能已执行。整个运行没有副作用。'));
  assert.throws(() => assertScopedBlockedCopy('本次工具未执行。此前步骤全部已回滚。'));
});
test('终态无步骤需要实际空态，不能通过空白/等待或二者混写', () => {
  assert.doesNotThrow(() => assertTerminalEmptyCopy('已取消 暂无步骤记录'));
  assert.doesNotThrow(() => assertTerminalEmptyCopy('失败 No step records'));
  assert.throws(() => assertTerminalEmptyCopy(''));
  assert.throws(() => assertTerminalEmptyCopy('失败 正在等待第一步结果'));
  assert.throws(() => assertTerminalEmptyCopy('暂无步骤记录 正在等待第一步结果'));
});
