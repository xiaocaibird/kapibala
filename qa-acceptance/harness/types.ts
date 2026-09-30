export type ResultStatus = 'NOT_RUN' | 'PASS' | 'FAIL' | 'BLOCKED';
export interface Requirement {
  id: string;
  title: string;
  source: unknown;
  expectation: string;
  scope: 'required' | 'candidate' | 'release';
  clarification?: string;
}
export interface CaseDefinition {
  id: string;
  title: string;
  requirements: string[];
  priority: 'P0' | 'P1' | 'P2';
  mode: 'automated' | 'manual' | 'blocked' | 'candidate';
  preconditions: string[];
  data: Record<string, unknown>;
  steps: string[];
  expected: string[];
  timing: string[];
  faults: string[];
  evidence: string[];
  cleanup: string[];
  automation?: string;
  blocker?: string;
  preparation?: {
    state: 'script-ready' | 'dependency-pending' | 'decision-pending';
    owner: string;
    details: string[];
  };
}
export interface CaseResult {
  id: string;
  status: ResultStatus;
  reason?: string;
  durationMs?: number;
  evidence: string[];
  defectId?: string;
  attempt?: number;
  project?: string;
  startedAt?: string;
  completedAt?: string;
  performedAt?: string;
  defectSeverity?: 'P0' | 'P1' | 'P2';
  manualReviewId?: string;
  clarificationResolution?: {
    reference: string;
    approvedBy: string;
    approvedAt: string;
    evidence: string[];
  };
}
export interface Command {
  command: string;
  args: string[];
}
export interface TargetConfig {
  version: 1;
  sut: {
    cwd: string;
    revision: string;
    start: Command;
    migrate: Command;
    web: Command;
    env: Record<string, string>;
    startupTimeoutMs: number;
  };
  adapters?: {
    capacityControl?: { url: string; contractReference: string };
    fixtureArtifacts?: { configPath: string; sha256: string };
  };
  database: { image: string };
  ui: {
    routes: Record<string, string>;
    selectors: Record<string, string>;
    adapterConfirmed: boolean;
  };
  release: {
    approvedProfile: string | null;
    concurrentUsers: number | null;
    durationSeconds: number | null;
    p95LatencyMs: number | null;
    maxErrorRate: number | null;
    soakSeconds: number | null;
    rpoSeconds: number | null;
    rtoSeconds: number | null;
    monitoringEvidence: string | null;
    backupRestoreEvidence: string | null;
    rollbackEvidence: string | null;
    productionSecurityEvidence: string | null;
  };
}
export interface Authorization {
  version: 1;
  approvedBy: string;
  approvalReference: string;
  approvedAt: string;
  expiresAt: string;
  sutRevision: string;
  sutDirectory: string;
  targetSha256: string;
  allowedActions: string[];
  scope: 'all-required' | 'developer-preflight';
  suiteId?: string;
  suiteSha256?: string;
}

export type ExecutionPurpose =
  { phase: 'execution' } | { phase: 'developer-preflight'; suiteId: string; suiteSha256: string };
