import { readFile, readdir, realpath } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CaseDefinition, Requirement } from './types.js';
import { isWithin } from './security.js';
const exec = promisify(execFile);
export const knownProjects = [
  'system',
  'chromium',
  'firefox-smoke',
  'webkit-smoke',
  'manual',
] as const;
export function caseProjects(c: CaseDefinition): string[] {
  const projects = c.data?.projects;
  if (projects !== undefined) {
    if (
      !Array.isArray(projects) ||
      !projects.length ||
      projects.some(
        (p) =>
          typeof p !== 'string' || !knownProjects.includes(p as (typeof knownProjects)[number]),
      ) ||
      new Set(projects).size !== projects.length
    )
      throw new Error(`${c.id}: projects必须是非空已知项目数组且不重复`);
    return projects as string[];
  }
  return c.mode === 'manual' || c.mode === 'blocked'
    ? ['manual']
    : [c.automation?.startsWith('tests/ui/') ? 'chromium' : 'system'];
}
export async function readCatalog(
  root: string,
): Promise<{ requirements: Requirement[]; cases: CaseDefinition[] }> {
  const requirements = JSON.parse(
    await readFile(resolve(root, 'requirements/catalog.json'), 'utf8'),
  ) as Requirement[];
  if (!Array.isArray(requirements)) throw new Error('需求必须为数组');
  const names = (await readdir(resolve(root, 'cases'))).filter((n) => n.endsWith('.json')).sort();
  const cases: CaseDefinition[] = [];
  for (const name of names) {
    const items = JSON.parse(await readFile(resolve(root, 'cases', name), 'utf8'));
    if (!Array.isArray(items)) throw new Error(`${name}: 用例必须为数组`);
    cases.push(...items);
  }
  return { requirements, cases };
}
export interface Registration {
  id: string;
  project: string;
  file: string;
  title: string;
}
export async function listRegistrations(root: string): Promise<Registration[]> {
  // --list registers tests only; it does not execute globalSetup, worker fixtures or SUT commands.
  const result = await exec(
    process.execPath,
    [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--list', '--reporter=json'],
    { cwd: root, timeout: 45000, maxBuffer: 8 * 1024 * 1024 },
  );
  const report = JSON.parse(result.stdout) as {
    config?: { rootDir?: string };
    suites?: unknown[];
    errors?: unknown[];
  };
  if (report.errors?.length)
    throw new Error(`Playwright登记失败: ${JSON.stringify(report.errors)}`);
  const entries: Registration[] = [];
  const visit = (suite: unknown) => {
    const s = suite as {
      suites?: unknown[];
      specs?: { title: string; file: string; tests: { projectName: string }[] }[];
    };
    for (const spec of s.specs ?? []) {
      const m = spec.title.match(/^\[([A-Z][A-Z0-9-]+)\]/);
      for (const t of spec.tests)
        entries.push({
          id: m?.[1] ?? '',
          title: spec.title,
          project: t.projectName,
          file: relative(root, resolve(report.config?.rootDir ?? root, spec.file)).replaceAll(
            '\\',
            '/',
          ),
        });
    }
    for (const child of s.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return entries;
}
export async function checkCatalog(root: string): Promise<string[]> {
  const { requirements, cases } = await readCatalog(root);
  const errors: string[] = [];
  const reqs = new Set<string>();
  const ids = new Set<string>();
  const strings = (x: unknown, nonempty = false) =>
    Array.isArray(x) &&
    (!nonempty || x.length > 0) &&
    x.every((v) => typeof v === 'string' && v.trim().length > 0);
  for (const r of requirements) {
    if (!r || typeof r !== 'object') {
      errors.push('需求不是对象');
      continue;
    }
    if (!r.id || reqs.has(r.id)) errors.push(`空/重复需求${r.id}`);
    reqs.add(r.id);
    if (
      !r.title ||
      !r.source ||
      !r.expectation ||
      !['required', 'candidate', 'release'].includes(r.scope)
    )
      errors.push(`${r.id}: 缺少或无效需求字段`);
  }
  for (const c of cases) {
    if (!c || typeof c !== 'object') {
      errors.push('用例不是对象');
      continue;
    }
    if (!c.id || ids.has(c.id)) errors.push(`空/重复用例${c.id}`);
    ids.add(c.id);
    for (const key of [
      'preconditions',
      'steps',
      'expected',
      'timing',
      'faults',
      'evidence',
      'cleanup',
    ] as const) {
      if (!strings(c[key], !['timing', 'faults'].includes(key)))
        errors.push(`${c.id}: ${key}必须为字符串数组，非可选场景数组不能为空`);
    }
    if (
      !c.title ||
      !c.data ||
      typeof c.data !== 'object' ||
      Array.isArray(c.data) ||
      !strings(c.requirements, true)
    )
      errors.push(`${c.id}: 缺用例基础字段`);
    if (
      !['P0', 'P1', 'P2'].includes(c.priority) ||
      !['automated', 'manual', 'blocked', 'candidate'].includes(c.mode)
    )
      errors.push(`${c.id}: 枚举非法`);
    for (const id of c.requirements ?? []) if (!reqs.has(id)) errors.push(`${c.id}: 未知需求${id}`);
    try {
      caseProjects(c);
    } catch (e) {
      errors.push(String(e));
    }
    if (c.mode === 'blocked' && !c.blocker) errors.push(`${c.id}: 缺少阻塞原因`);
    if (c.mode === 'automated') {
      if (
        !c.automation ||
        !/^tests\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.spec\.ts$/.test(c.automation)
      )
        errors.push(`${c.id}: 自动化入口缺失或非法`);
      else
        try {
          const path = await realpath(resolve(root, c.automation));
          if (!isWithin(await realpath(root), path)) errors.push(`${c.id}: 自动化入口逃逸QA目录`);
        } catch {
          errors.push(`${c.id}: 自动化文件不存在`);
        }
    }
  }
  for (const r of requirements)
    if (!cases.some((c) => Array.isArray(c?.requirements) && c.requirements.includes(r.id)))
      errors.push(`${r.id}: 无用例覆盖`);
  if (errors.length) return errors;
  let registered: Registration[];
  try {
    registered = await listRegistrations(root);
  } catch (e) {
    errors.push(`无法核实可执行登记: ${String(e)}`);
    return errors;
  }
  const seen = new Set<string>();
  for (const item of registered) {
    const c = cases.find((c) => c.id === item.id);
    const key = `${item.id}:${item.project}`;
    if (!c) {
      errors.push(`未登记的自动化测试: ${item.title} (${item.file})`);
      continue;
    }
    if (c.mode !== 'automated') errors.push(`${item.id}: 非automated用例不应注册成可执行产品测试`);
    if (seen.has(key)) errors.push(`${item.id}: 项目${item.project}重复注册`);
    seen.add(key);
    if (item.file !== c.automation)
      errors.push(`${item.id}: 注册文件${item.file}与${c.automation}不一致`);
    if (!caseProjects(c).includes(item.project))
      errors.push(`${item.id}: 未声明项目${item.project}`);
  }
  for (const c of cases.filter((c) => c.mode === 'automated'))
    for (const project of caseProjects(c))
      if (!seen.has(`${c.id}:${project}`))
        errors.push(`${c.id}: 缺少${project}的真实Playwright注册`);
  return errors;
}
