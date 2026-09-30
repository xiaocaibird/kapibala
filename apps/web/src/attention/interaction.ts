/** An explicit view action is valid only during one uninterrupted foreground
 * interaction. Returning focus cannot revive a refresh or frame queued earlier. */
export class AttentionInteractionEpoch {
  private epoch = 0;

  begin(): number {
    return ++this.epoch;
  }

  invalidate(): void {
    this.epoch++;
  }

  isCurrent(epoch: number): boolean {
    return epoch === this.epoch;
  }
}
