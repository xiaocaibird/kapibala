# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: system/protocol-boundaries.spec.ts >> [BLK-EXT-004] an already effective kick is not repeated against a rejoined target after restart
- Location: tests/system/protocol-boundaries.spec.ts:294:1

# Error details

```
Error: Barrier kick-before-rejoin was not reached within 5000ms
```

# Test source

```ts
  1  | /** Controllable barriers belong to the QA process, never the application under test. */
  2  | export interface BarrierHit {
  3  |   name: string;
  4  |   hits: number;
  5  |   at: string;
  6  |   context: unknown;
  7  | }
  8  | 
  9  | export interface BarrierSpec {
  10 |   phase: 'request' | 'after-effect' | 'before-response';
  11 |   name: string;
  12 | }
  13 | 
  14 | interface BarrierState {
  15 |   hit?: BarrierHit;
  16 |   reached: Promise<BarrierHit>;
  17 |   notify: (hit: BarrierHit) => void;
  18 |   released: Promise<void>;
  19 |   release: () => void;
  20 | }
  21 | 
  22 | export class BarrierController {
  23 |   private readonly states = new Map<string, BarrierState>();
  24 | 
  25 |   private state(name: string): BarrierState {
  26 |     const existing = this.states.get(name);
  27 |     if (existing) return existing;
  28 |     let notify!: (hit: BarrierHit) => void;
  29 |     let release!: () => void;
  30 |     const state: BarrierState = {
  31 |       reached: new Promise<BarrierHit>((resolve) => {
  32 |         notify = resolve;
  33 |       }),
  34 |       notify: (hit) => notify(hit),
  35 |       released: new Promise<void>((resolve) => {
  36 |         release = resolve;
  37 |       }),
  38 |       release: () => release(),
  39 |     };
  40 |     this.states.set(name, state);
  41 |     return state;
  42 |   }
  43 | 
  44 |   async hit(name: string, context: unknown = null): Promise<void> {
  45 |     const state = this.state(name);
  46 |     state.hit = { name, hits: (state.hit?.hits ?? 0) + 1, at: new Date().toISOString(), context };
  47 |     state.notify(state.hit);
  48 |     await state.released;
  49 |   }
  50 | 
  51 |   async waitFor(name: string, timeoutMs = 5_000): Promise<BarrierHit> {
  52 |     let timer: ReturnType<typeof setTimeout> | undefined;
  53 |     try {
  54 |       return await Promise.race([
  55 |         this.state(name).reached,
  56 |         new Promise<never>((_, reject) => {
  57 |           timer = setTimeout(
> 58 |             () => reject(new Error(`Barrier ${name} was not reached within ${timeoutMs}ms`)),
     |                          ^ Error: Barrier kick-before-rejoin was not reached within 5000ms
  59 |             timeoutMs,
  60 |           );
  61 |         }),
  62 |       ]);
  63 |     } finally {
  64 |       if (timer) clearTimeout(timer);
  65 |     }
  66 |   }
  67 | 
  68 |   release(name: string): void {
  69 |     this.state(name).release();
  70 |   }
  71 | 
  72 |   snapshot(): BarrierHit[] {
  73 |     return structuredClone(
  74 |       [...this.states.values()].flatMap((state) => (state.hit ? [state.hit] : [])),
  75 |     );
  76 |   }
  77 | 
  78 |   releaseAll(): void {
  79 |     for (const state of this.states.values()) state.release();
  80 |   }
  81 | }
  82 | 
```