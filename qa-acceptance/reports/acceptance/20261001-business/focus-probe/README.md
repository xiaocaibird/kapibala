# 浏览器焦点前提修正

2026-10-01T07:37:57.096Z，仅 QA 工具；未连接 SUT，未修改产品或本轮原始 BLOCKED。

Playwright 1.63.0 的本地固定源码 `playwright-core/lib/coreBundle.js:37638` 默认对 Chromium 主 frame 开启 `Emulation.setFocusEmulationEnabled { enabled: true }`。独立有头 Chromium 153.0.8010.12 的两个自有 about:blank 页面实测：默认无论哪个 bringToFront，两个 `document.hasFocus()` 都为 true。因而此前仅改为有头仍不能建立失焦前提。

对两个页面用受支持 CDP 发送 `enabled:false` 并 detach 后，三次真实 bringToFront 均建立前台 true / 后台 false；原生 blur/focus 的 `isTrusted=true`。没有赋值 DOM、替换 hasFocus/visibility 或发送合成事件。两个页面 `visibilityState` 均仍 visible：本次仅验证真实失焦，不能表述为 hidden 或操作系统窗口切换。

最小修正新增 `tests/ui/native-focus.ts`，仅移除 Chromium 的工具仿真，建立真实排他焦点并留证；不能建立时仍 BLOCKED。console只替换共有backgroundTab定义，observation-boundaries改为调用同一入口；没有改用例的通知、读取、确认或时限预期。非Chromium不发送CDP，继续检查实际焦点前提。

影响UI-020/021/028/029/030/031/032/033/034/035与ARC-UI-BLK-001。原11条阻塞保留；后续产品结论必须来自独立登记重测。

验证：

- `node reports/acceptance/20261001-business/focus-probe/probe.mjs`：直接CDP对照PASS。
- `node --import tsx reports/acceptance/20261001-business/focus-probe/probe.mjs --helper`：实际新helper在空白页建立后台与返回前台PASS。
- `npm run typecheck`、`npm run check:catalog`（128项需求、266条用例）、`npm run check:suites`、`git diff --check`：PASS；均未启动产品。

两次脚本都在finally关闭其自有浏览器，close完成；工具自身PID、版本、UTC、原生事件、实际状态、命令与脚本SHA保存在对应JSON。`review.json`记录源码依据和各文件SHA。2秒只限制工具前提观察，不修改产品SLA。
