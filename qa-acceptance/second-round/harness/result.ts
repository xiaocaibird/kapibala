import { strict as assert } from 'node:assert';
import { BlockedError } from '../../harness/security.js';

export type Status = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';
export interface VariantResult {
  id: string; status: Status; reason?: string; evidence: string[];
}
export interface RoundResult {
  caseId: string; status: Status; variants: VariantResult[];
  uncoveredVariants?: string[]; reason?: string; evidence?: string[];
  startedAt?: string; completedAt?: string; durationMs?: number;
  attempt?: number; phase?: 'smoke' | 'acceptance'; cleanupErrors?: string[];
}
/** Status may only be computed from actual evidence; no proof from no exception. */
export function combineVariants(variants: VariantResult[], missing: string[] = []): Status {
  if (variants.some(v => v.status === 'FAIL')) return 'FAIL';
  if (!variants.length || missing.length || variants.some(v => v.status !== 'PASS')) return 'BLOCKED';
  if (variants.some(v => !v.evidence.length)) return 'BLOCKED';
  return 'PASS';
}
export function classifyError(error: unknown): 'FAIL' | 'BLOCKED' {
  if (error instanceof assert.AssertionError || (error as {name?:string})?.name === 'AssertionError') return 'FAIL';
  if (error && typeof error === 'object' && 'matcherResult' in error &&
      (error as {matcherResult?:unknown}).matcherResult &&
      typeof (error as {matcherResult:unknown}).matcherResult === 'object') return 'FAIL';
  if (error instanceof BlockedError || /^\[BLOCKED\]/.test(String(error))) return 'BLOCKED';
  // A driver or infrastructure exception alone does not establish a business violation.
  return 'BLOCKED';
}
export function validateResult(result: RoundResult): RoundResult {
  const actual = combineVariants(result.variants, [...(result.uncoveredVariants ?? []), ...(result.cleanupErrors ?? [])]);
  if (result.status !== actual) throw new Error(`Result status disagrees with variants: ${result.caseId}`);
  return result;
}
