import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCatalog } from './catalog.js';
import type { CaseDefinition } from './types.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { requirements, cases } = await readCatalog(root);
await mkdir(resolve(root, 'cases/generated'), { recursive: true });
const locations = new Map<string, string>();
for (const name of (await readdir(resolve(root, 'cases')))
  .filter((n) => n.endsWith('.json'))
  .sort()) {
  const entries = JSON.parse(
    await readFile(resolve(root, 'cases', name), 'utf8'),
  ) as CaseDefinition[];
  const file = name.replace(/\.json$/, '.md');
  let markdown = `# ${name} 用例阅读版\n\n由JSON源自动生成；以JSON和脚本为维护入口。本文件没有执行结论。\n`;
  for (const c of entries) {
    locations.set(c.id, file);
    markdown += `\n<a id="${c.id}"></a>\n\n## ${c.id} · ${c.title}\n\n- 需求：${c.requirements.join('、')}\n- 优先级：${c.priority}；方法：${c.mode}\n- 自动化入口：${c.automation ?? '按下面步骤人工执行或先解决阻塞'}\n${c.blocker ? `- 阻塞：${c.blocker}\n` : ''}`;
    for (const [label, items] of [
      ['前置条件', c.preconditions],
      ['执行步骤', c.steps],
      ['预期结果', c.expected],
      ['时序要求', c.timing],
      ['故障注入', c.faults],
      ['取证', c.evidence],
      ['清理', c.cleanup],
    ] as [string, string[]][]) {
      markdown += `\n**${label}**\n\n${items.length ? items.map((s, i) => `${i + 1}. ${s}`).join('\n') : '无额外要求。'}\n`;
    }
    markdown += `\n**数据**\n\n\x60\x60\x60json\n${JSON.stringify(c.data, null, 2)}\n\x60\x60\x60\n`;
  }
  await writeFile(resolve(root, 'cases/generated', file), markdown);
}
let trace =
  '# 需求—用例双向追踪\n\n由独立需求目录与用例JSON生成。有关联用例不等于已经执行或通过；未决子场景仍单独登记。\n\n|需求|范围|验收目标|用例及方法|\n|---|---|---|---|\n';
for (const req of requirements) {
  const matches = cases.filter((c) => c.requirements.includes(req.id));
  trace += `|${req.id} ${req.title}|${req.scope}|${req.expectation.replaceAll('|', '\\|')}|${matches.map((c) => `[${c.id}](../cases/generated/${locations.get(c.id)}#${c.id}) (${c.mode})`).join('<br>')}|\n`;
}
await writeFile(resolve(root, 'requirements/traceability.md'), trace);
console.log(`生成${cases.length}条用例阅读版与${requirements.length}项需求追踪表；未执行产品。`);
