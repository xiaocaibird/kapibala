import { createHash } from 'node:crypto';
import { caseProjects, readCatalog } from './catalog.js';
import { caseIdGrep } from './suites.js';
import type { CaseDefinition, Requirement } from './types.js';

/** Complete business baseline, never a caller-selected suite. Manual cases stay in the denominator. */
export interface BusinessScope {
  kind: 'all-business';
  requirements: Requirement[];
  cases: CaseDefinition[];
  projects: string[];
  playwrightArgs: string[];
}
export function resolveBusinessScope(
  requirements: Requirement[],
  cases: CaseDefinition[],
): BusinessScope {
  if (
    new Set(requirements.map((r) => r.id)).size !== requirements.length ||
    new Set(cases.map((c) => c.id)).size !== cases.length
  )
    throw new Error('业务基线含重复需求或用例');
  const business = requirements
    .filter((r) => r.scope === 'required')
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!business.length) throw new Error('业务验收不能使用空需求基线');
  const ids = new Set(business.map((r) => r.id));
  const selected = cases
    .filter((c) => c.mode !== 'candidate' && c.requirements.some((id) => ids.has(id)))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const r of business)
    if (!selected.some((c) => c.requirements.includes(r.id)))
      throw new Error(`业务需求无验收用例: ${r.id}`);
  const automated = selected.filter((c) => c.mode === 'automated');
  if (!automated.length) throw new Error('业务验收缺少可登记的自动化入口');
  const projects = [...new Set(selected.flatMap(caseProjects))].sort();
  const automatedProjects = [...new Set(automated.flatMap(caseProjects))].sort();
  if (automatedProjects.includes('manual') || automated.some((c) => !c.automation))
    throw new Error('业务自动化项目或入口无效');
  return {
    kind: 'all-business',
    requirements: business,
    cases: selected,
    projects,
    playwrightArgs: [
      'test',
      '--grep',
      caseIdGrep(automated.map((c) => c.id)),
      ...automatedProjects.map((p) => `--project=${p}`),
    ],
  };
}
export async function readBusinessScope(root: string): Promise<BusinessScope> {
  const catalog = await readCatalog(root);
  return resolveBusinessScope(catalog.requirements, catalog.cases);
}
export function businessFingerprint(scope: BusinessScope): string {
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex');
}
