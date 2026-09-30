/** Evidence belongs to a successful snapshot, and covers only events already
 * consumed when its request STARTED. A completed failed refresh is not evidence. */
export interface SnapshotEvidence {
  seq: number;
  revision: number;
  path: string;
}

export interface AttentionCandidate {
  key: string;
  seq: number;
  tab: boolean;
  baseline?: string;
}

/** One current page target. Business adapters decide which events are changes;
 * this model never interprets global invalidation revisions as new content. */
export class AttentionCandidates {
  readonly pending = new Map<string, AttentionCandidate>();
  private readonly consumed = new Map<string, number>();

  seenThrough(key: string): number {
    return this.consumed.get(key) ?? -1;
  }

  receive(
    key: string,
    seq: number,
    startSeq: number,
    background: boolean,
    baseline?: string,
  ): boolean {
    if (seq <= startSeq || seq <= (this.consumed.get(key) ?? -1)) return false;
    this.consumed.set(key, seq);
    const previous = this.pending.get(key);
    // A newer visible state subsumes intermediate states of this same target.
    if (previous && previous.seq >= seq) return false;
    this.pending.set(key, {
      key,
      seq,
      tab: background || (previous?.tab ?? false),
      baseline: previous ? previous.baseline : baseline,
    });
    return true;
  }

  promoteBackground(): boolean {
    let changed = false;
    for (const value of this.pending.values()) {
      if (!value.tab) {
        value.tab = true;
        changed = true;
      }
    }
    return changed;
  }

  reconcile(
    versions: Readonly<Record<string, string>>,
    evidence: SnapshotEvidence | null,
  ): boolean {
    let changed = false;
    if (!evidence) return changed;
    for (const [key, value] of this.pending) {
      if (
        value.seq <= evidence.seq &&
        value.baseline !== undefined &&
        versions[key] === value.baseline
      ) {
        this.pending.delete(key);
        changed = true;
      }
    }
    return changed;
  }

  confirm(
    key: string,
    evidence: SnapshotEvidence | null,
    upToSeq: number,
  ): boolean {
    const value = this.pending.get(key);
    if (!value || !evidence || value.seq > evidence.seq || value.seq > upToSeq)
      return false;
    return this.pending.delete(key);
  }

  get tabPending(): boolean {
    return [...this.pending.values()].some((value) => value.tab);
  }
}
