import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { caseProjects, knownProjects, readCatalog, type Registration } from './catalog.js';
import type { CaseDefinition } from './types.js';

export interface SuiteDefinition {
  id: string;
  title: string;
  purpose: string;
  caseIds: string[];
  projects: string[];
  riskBoundaries: string[];
}

interface SuiteManifest {
  schemaVersion: 1;
  owner: 'QA';
  suites: SuiteDefinition[];
}

export interface ResolvedSuite extends SuiteDefinition {
  /** Pass this string as one --grep argument; never interpolate it into a shell command. */
  grep: string;
  cases: { id: string; title: string; automation: string; projects: string[] }[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label}必须是对象`);
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, allowed: string[], label: string): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`${label}含未支持字段${key}；子集不能复制用例标准`);
}

function strings(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((item) => typeof item !== 'string' || !item.trim())
  )
    throw new Error(`${label}必须是非空字符串数组`);
  if (new Set(value).size !== value.length) throw new Error(`${label}含重复项`);
  return [...value] as string[];
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}必须是非空字符串`);
  return value;
}

export function validateSuiteManifest(input: unknown): SuiteManifest {
  const top = record(input, 'suite manifest');
  fields(top, ['schemaVersion', 'owner', 'suites'], 'suite manifest');
  if (top.schemaVersion !== 1 || top.owner !== 'QA')
    throw new Error('suite manifest必须为schemaVersion=1且owner=QA');
  if (!Array.isArray(top.suites) || !top.suites.length) throw new Error('suites不能为空');
  const suiteIds = new Set<string>();
  const suites = top.suites.map((item: unknown) => {
    const value = record(item, 'suite');
    fields(value, ['id', 'title', 'purpose', 'caseIds', 'projects', 'riskBoundaries'], 'suite');
    const id = text(value.id, 'suite.id');
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`非法suite ID: ${id}`);
    if (suiteIds.has(id)) throw new Error(`重复suite ID: ${id}`);
    suiteIds.add(id);
    const caseIds = strings(value.caseIds, `${id}.caseIds`);
    for (const caseId of caseIds)
      if (!/^[A-Z][A-Z0-9-]+$/.test(caseId)) throw new Error(`${id}: 非法用例ID ${caseId}`);
    const projects = strings(value.projects, `${id}.projects`);
    for (const project of projects)
      if (
        project === 'manual' ||
        !knownProjects.includes(project as (typeof knownProjects)[number])
      )
        throw new Error(`${id}: 未知或非自动化项目 ${project}`);
    return {
      id,
      title: text(value.title, `${id}.title`),
      purpose: text(value.purpose, `${id}.purpose`),
      caseIds,
      projects,
      riskBoundaries: strings(value.riskBoundaries, `${id}.riskBoundaries`),
    };
  });
  return { schemaVersion: 1, owner: 'QA', suites };
}

export function caseIdGrep(caseIds: string[]): string {
  const ids = strings(caseIds, 'grep caseIds');
  const escaped = ids.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Playwright tests against a full title containing project, filename and test title.
  // Match a complete [ID] token rather than a prefix such as AUTH-001 inside AUTH-0010.
  return `(?:^|\\s)\\[(?:${escaped.join('|')})\\](?=\\s|$)`;
}

export function resolveSuiteDefinition(
  manifest: unknown,
  definitions: CaseDefinition[],
  name: string,
): ResolvedSuite {
  const input = validateSuiteManifest(manifest);
  const suite = input.suites.find((item) => item.id === name);
  if (!suite)
    throw new Error(`未知suite ${name}；可用：${input.suites.map((s) => s.id).join(', ')}`);
  const registry = new Map<string, CaseDefinition>();
  for (const definition of definitions) {
    if (!definition || typeof definition.id !== 'string' || !definition.id)
      throw new Error('用例catalog包含空或无效ID');
    if (registry.has(definition.id)) throw new Error(`用例catalog包含重复ID ${definition.id}`);
    registry.set(definition.id, definition);
  }
  const cases = suite.caseIds.map((id) => {
    const definition = registry.get(id);
    if (!definition) throw new Error(`${suite.id}: 未知用例 ${id}`);
    if (definition.mode !== 'automated')
      throw new Error(`${suite.id}: ${id}为${definition.mode}，不可作为可执行子集`);
    if (!definition.automation) throw new Error(`${suite.id}: ${id}缺自动化入口`);
    const projects = caseProjects(definition).filter((project) => suite.projects.includes(project));
    if (!projects.length) throw new Error(`${suite.id}: ${id}在声明项目中没有可执行登记目标`);
    return { id, title: definition.title, automation: definition.automation, projects };
  });
  for (const project of suite.projects)
    if (!cases.some((item) => item.projects.includes(project)))
      throw new Error(`${suite.id}: 项目${project}未选择任何用例`);
  return { ...suite, grep: caseIdGrep(suite.caseIds), cases };
}

async function readInputs(
  root: string,
): Promise<{ manifest: SuiteManifest; cases: CaseDefinition[] }> {
  const [raw, catalog] = await Promise.all([
    readFile(resolve(root, 'sharing/suites.json'), 'utf8'),
    readCatalog(root),
  ]);
  return { manifest: validateSuiteManifest(JSON.parse(raw)), cases: catalog.cases };
}

/** Reads QA metadata only. Does not resolve authorization, import product code or start fixtures. */
export async function resolveSuite(root: string, name: string): Promise<ResolvedSuite> {
  const input = await readInputs(root);
  return resolveSuiteDefinition(input.manifest, input.cases, name);
}

export async function listSuites(root: string): Promise<ResolvedSuite[]> {
  const input = await readInputs(root);
  return input.manifest.suites.map((suite) =>
    resolveSuiteDefinition(input.manifest, input.cases, suite.id),
  );
}

/** Checks --list metadata only, including accidental matches in another test's title. */
export function checkSuiteRegistrations(
  suite: ResolvedSuite,
  registrations: Registration[],
): string[] {
  const errors: string[] = [];
  const regexp = new RegExp(suite.grep);
  const expected = new Map<string, ResolvedSuite['cases'][number]>(
    suite.cases.flatMap((item) =>
      item.projects.map((project) => [`${item.id}:${project}`, item] as const),
    ),
  );
  const seen = new Set<string>();
  for (const registration of registrations) {
    if (!suite.projects.includes(registration.project) || !regexp.test(registration.title))
      continue;
    const key = `${registration.id}:${registration.project}`;
    const item = expected.get(key);
    if (!item) {
      errors.push(`${suite.id}: grep意外选中${key}`);
      continue;
    }
    if (seen.has(key)) errors.push(`${suite.id}: ${key}重复注册`);
    seen.add(key);
    if (registration.file !== item.automation)
      errors.push(`${suite.id}: ${key}注册文件与catalog不一致`);
  }
  for (const key of expected.keys()) if (!seen.has(key)) errors.push(`${suite.id}: 缺少注册${key}`);
  return errors;
}
