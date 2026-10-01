import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTarget, BlockedError } from './security.js';
import {
  readManualFollowupScope,
  manualScopeFingerprint,
  beginManualFollowup,
  readyManualFollowup,
  recordManualFollowup,
  reportManualFollowup,
  type ManualReady,
  type ManualFollowupReview,
} from './manual-followup.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const [action, ...args] = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  if (
    !['--target', '--authorization', '--run', '--input'].includes(args[i]!) ||
    options.has(args[i]!) ||
    !args[i + 1] ||
    args[i + 1]!.startsWith('--')
  )
    throw new Error('非法人工续测参数');
  options.set(args[i]!, args[i + 1]!);
}
function required(name: string) {
  const value = options.get(name);
  if (!value) throw new Error(`缺少${name}`);
  return resolve(root, value);
}
async function bindPurpose() {
  if (
    process.env.QA_EXECUTION_SUITE_ID ||
    process.env.QA_EXECUTION_SUITE_SHA256 ||
    process.env.QA_EXECUTION_BUSINESS_SHA256 ||
    (process.env.QA_EXECUTION_KIND && process.env.QA_EXECUTION_KIND !== 'manual-followup')
  )
    throw new BlockedError('当前shell携带其它执行用途；不能隐式升级或替换');
  const digest = manualScopeFingerprint(await readManualFollowupScope(root));
  if (process.env.QA_EXECUTION_MANUAL_SHA256 && process.env.QA_EXECUTION_MANUAL_SHA256 !== digest)
    throw new BlockedError('已有人工摘要失配');
  process.env.QA_EXECUTION_KIND = 'manual-followup';
  process.env.QA_EXECUTION_MANUAL_SHA256 = digest;
  process.env.QA_EXECUTION_AUTHORIZATION = required('--authorization');
}
try {
  if (action === 'hash') console.log(manualScopeFingerprint(await readManualFollowupScope(root)));
  else if (action === 'begin' || action === 'ready') {
    await bindPurpose();
    const target = await loadTarget(required('--target'), root);
    if (action === 'begin') console.log(await beginManualFollowup(root, target));
    else {
      await readyManualFollowup(
        root,
        required('--run'),
        target,
        JSON.parse(await readFile(required('--input'), 'utf8')) as ManualReady,
      );
      console.log('READY: 后续真人动作才可正式记录');
    }
  } else if (action === 'record')
    console.log(
      await recordManualFollowup(
        root,
        required('--run'),
        JSON.parse(await readFile(required('--input'), 'utf8')) as ManualFollowupReview,
      ),
    );
  else if (action === 'report') console.log(await reportManualFollowup(root, required('--run')));
  else
    throw new Error(
      '用法: manual-followup-cli.ts hash | begin --target ... --authorization ... | ready --target ... --authorization ... --run ... --input ... | record --run ... --input ... | report --run ...',
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error instanceof BlockedError ? 2 : 1;
}
