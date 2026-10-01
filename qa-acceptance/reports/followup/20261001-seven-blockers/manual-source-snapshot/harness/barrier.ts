/** Controllable barriers belong to the QA process, never the application under test. */
export interface BarrierHit {
  name: string;
  hits: number;
  at: string;
  context: unknown;
}

export interface BarrierSpec {
  phase: 'request' | 'after-effect' | 'before-response';
  name: string;
}

interface BarrierState {
  hit?: BarrierHit;
  reached: Promise<BarrierHit>;
  notify: (hit: BarrierHit) => void;
  released: Promise<void>;
  release: () => void;
}

export class BarrierController {
  private readonly states = new Map<string, BarrierState>();

  private state(name: string): BarrierState {
    const existing = this.states.get(name);
    if (existing) return existing;
    let notify!: (hit: BarrierHit) => void;
    let release!: () => void;
    const state: BarrierState = {
      reached: new Promise<BarrierHit>((resolve) => {
        notify = resolve;
      }),
      notify: (hit) => notify(hit),
      released: new Promise<void>((resolve) => {
        release = resolve;
      }),
      release: () => release(),
    };
    this.states.set(name, state);
    return state;
  }

  async hit(name: string, context: unknown = null): Promise<void> {
    const state = this.state(name);
    state.hit = { name, hits: (state.hit?.hits ?? 0) + 1, at: new Date().toISOString(), context };
    state.notify(state.hit);
    await state.released;
  }

  async waitFor(name: string, timeoutMs = 5_000): Promise<BarrierHit> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.state(name).reached,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Barrier ${name} was not reached within ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  release(name: string): void {
    this.state(name).release();
  }

  snapshot(): BarrierHit[] {
    return structuredClone(
      [...this.states.values()].flatMap((state) => (state.hit ? [state.hit] : [])),
    );
  }

  releaseAll(): void {
    for (const state of this.states.values()) state.release();
  }
}
