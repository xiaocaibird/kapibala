# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui/console.spec.ts >> [UI-034] Agent自己的自动消息仍参与失焦提醒
- Location: tests/ui/console.spec.ts:1241:1

# Error details

```
Error: Barrier automatic-send was not reached within 5000ms
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - link "K kapibala ." [ref=e5] [cursor=pointer]:
      - /url: "#/groups"
      - generic [ref=e6]: K
      - text: kapibala
      - generic [ref=e7]: .
    - generic [ref=e8]: 工作空间
    - navigation [ref=e9]:
      - link "群组工作台" [ref=e10] [cursor=pointer]:
        - /url: "#/groups"
      - link "服务账号" [ref=e15] [cursor=pointer]:
        - /url: "#/accounts"
      - link "Agent 运行" [ref=e20] [cursor=pointer]:
        - /url: "#/agent-runs"
      - link "定时序列" [ref=e24] [cursor=pointer]:
        - /url: "#/sequences"
    - generic [ref=e31]:
      - generic [ref=e39]:
        - strong [ref=e40]: 消息运营平台
        - generic [ref=e41]: 本地工作空间
      - generic [ref=e42]:
        - generic [ref=e43]: A
        - generic [ref=e44]:
          - strong [ref=e45]: admin
          - generic [ref=e46]: 管理员
        - button "退出登录" [ref=e47] [cursor=pointer]
  - generic [ref=e50]:
    - generic [ref=e51]:
      - generic [ref=e52]:
        - text: 工作空间
        - generic [ref=e53]: /
        - strong [ref=e54]: 群组工作台
      - status [ref=e56]: 连接恢复中
    - main [ref=e58]:
      - generic [ref=e59]: 实时连接已断开，正在自动重连并补齐期间的变化。
      - link "← 群组工作台" [ref=e60] [cursor=pointer]:
        - /url: "#/groups"
      - generic [ref=e63]:
        - generic [ref=e64]:
          - generic [ref=e65]: GROUP DETAILS
          - heading "gateway-group-1" [level=1] [ref=e66]
          - paragraph [ref=e67]: 网关群 ID · gateway-group-1
        - generic [ref=e68]:
          - generic [ref=e69]: 可用
          - link "定时序列" [ref=e71] [cursor=pointer]:
            - /url: "#/sequences/992cf77d-e6ea-420b-8af8-d562d876c971"
      - generic [ref=e72]:
        - generic [ref=e73]:
          - generic [ref=e74]:
            - generic [ref=e75]:
              - heading "消息时间线" [level=2] [ref=e76]
              - generic [ref=e79]: 1 条已加载
            - article [ref=e82]:
              - generic [ref=e83]: ui
              - generic [ref=e84]:
                - generic [ref=e85]:
                  - strong [ref=e86]: external-ui
                  - time [ref=e87]: 10/01 14:48:38
                - generic [ref=e88]: 前台读取的触发消息
                - generic "gateway-message-1" [ref=e90]
            - generic [ref=e91]:
              - textbox "消息内容" [ref=e92]:
                - /placeholder: 输入要发送到群的消息…
              - generic [ref=e93]:
                - generic [ref=e94]:
                  - text: 发送身份
                  - combobox "发送身份" [ref=e95]:
                    - option "暂无可用账号" [disabled]
                    - option "account-1" [selected]
                    - option "account-2"
                    - option "account-3"
                - button "发送消息" [disabled] [ref=e96]
          - generic [ref=e99]:
            - generic [ref=e100]:
              - heading "最近 Agent 运行" [level=2] [ref=e101]
              - generic [ref=e104]: "1"
            - status [ref=e105]:
              - generic [ref=e106]: Agent 运行列表有更新；刷新后确认当前范围。
              - button "刷新并查看更新" [ref=e107] [cursor=pointer]
            - link "失败 52b05002-c6a1-4de8-bc96-0b18dc6dc46d protocol_errors" [ref=e109] [cursor=pointer]:
              - /url: "#/agent-runs/52b05002-c6a1-4de8-bc96-0b18dc6dc46d"
              - generic [ref=e110]: 失败
              - code [ref=e115]: 52b05002-c6a1-4de8-bc96-0b18dc6dc46d
              - generic [ref=e116]: protocol_errors
        - complementary [ref=e117]:
          - generic [ref=e120]:
            - generic [ref=e121]:
              - heading "群资料" [level=2] [ref=e122]
              - button "编辑资料" [ref=e123] [cursor=pointer]
            - generic [ref=e124]:
              - generic [ref=e125]:
                - term [ref=e126]: 群简介
                - definition [ref=e127]: 未填写
              - generic [ref=e128]:
                - term [ref=e129]: 创建时间
                - definition [ref=e130]:
                  - time [ref=e131]: 2026/10/01 14:48:37
              - generic [ref=e132]:
                - term [ref=e133]: 平台群 ID
                - definition [ref=e134]: 992cf77d-e6ea-420b-8af8-d562d876c971
          - generic [ref=e137]:
            - heading "自动化设置" [level=2] [ref=e139]
            - generic [ref=e140]:
              - generic [ref=e141]:
                - generic [ref=e142]:
                  - strong [ref=e143]: Agent 自动应答
                  - paragraph [ref=e144]: 接收外部成员消息并启动执行。
                - switch "Agent 自动应答" [checked] [ref=e145] [cursor=pointer]
              - generic [ref=e147]:
                - generic [ref=e148]:
                  - strong [ref=e149]: 允许自动移除成员
                  - paragraph [ref=e150]: 需审计通过且执行账号具备权限。
                - switch "允许自动移除成员" [ref=e151] [cursor=pointer]
          - generic [ref=e155]:
            - generic [ref=e156]:
              - heading "群成员" [level=2] [ref=e157]
              - generic [ref=e158]: "3"
            - generic [ref=e159]:
              - generic [ref=e160]:
                - generic [ref=e161]: "-2"
                - generic [ref=e162]:
                  - strong [ref=e163]: account-2
                  - generic "platform-account-2" [ref=e164]
                - generic [ref=e165]: 群管理员
              - generic [ref=e166]:
                - generic [ref=e167]: "-1"
                - generic [ref=e168]:
                  - strong [ref=e169]: account-1
                  - generic "platform-account-1" [ref=e170]
                - generic [ref=e171]: 群主
              - generic [ref=e172]:
                - generic [ref=e173]: "-3"
                - generic [ref=e174]:
                  - strong [ref=e175]: account-3
                  - generic "platform-account-3" [ref=e176]
                - generic [ref=e177]: 成员
            - paragraph [ref=e178]: 控制台管理员负责平台管理；这里的群内角色决定服务账号在本群可执行的操作，两者相互独立。
          - generic [ref=e179]:
            - heading "退出群组" [level=3] [ref=e180]
            - paragraph [ref=e181]: 服务账号依次退出，群主最后退出。任务结果会保留每个失败步骤。
            - button "全部服务账号退群" [ref=e182] [cursor=pointer]
      - generic [ref=e183]:
        - generic [ref=e184]: Kapibala Console
        - generic [ref=e185]: 状态有记录，执行可追踪。
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
     |                          ^ Error: Barrier automatic-send was not reached within 5000ms
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