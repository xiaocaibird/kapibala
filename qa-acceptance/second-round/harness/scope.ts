import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const secondRoundRoot = fileURLToPath(new URL('../', import.meta.url));
export interface SecondRoundCase {
  id: string; title: string; requirements: string[]; mode: string;
  priority: string; steps: string[]; expected: string[]; dependencies: string[];
  automation?: string | null; manualCoverage?: unknown;
  [key: string]: unknown;
}
export async function secondRoundCases(root = secondRoundRoot): Promise<SecondRoundCase[]> {
  const scope = JSON.parse(await readFile(resolve(root, 'config/execution-scope.json'), 'utf8'));
  const cases: SecondRoundCase[] = [];
  for (const file of scope.caseAuthority) {
    if (!/^cases\/[a-z0-9-]+\.json$/.test(file)) throw new Error('Invalid case source');
    cases.push(...JSON.parse(await readFile(resolve(root, file), 'utf8')));
  }
  if (cases.length !== new Set(cases.map(c => c.id)).size) throw new Error('Duplicate case ID');
  return cases;
}
export async function secondRoundFingerprint(root = secondRoundRoot): Promise<string> {
  const hash = createHash('sha256');
  const files = ['config/execution-scope.json', 'config/smoke-selection.json',
    'requirements/catalog.json', 'requirements/baseline.json', 'requirements/execution-baseline.json',
    'cases/c1-c2.json', 'cases/enhancements-backend.json', 'cases/enhancements-ui.json'];
  for (const file of files) {
    const bytes = await readFile(resolve(root, file));
    hash.update(`${file}\0${bytes.length}\0`).update(bytes);
  }
  // Later narrow authority is independently frozen without rewriting the original scope.
  const closeout = 'config/bounded-closeout.json';
  try {
    const bytes = await readFile(resolve(root, closeout));
    hash.update(`${closeout}\0${bytes.length}\0`).update(bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return hash.digest('hex');
}
