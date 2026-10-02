# Linux 文件归属独立补证

子义务结论：**PASS**。关联整例 SR-C2-008 / SR-BE-USG-006：本报告不作整例通过判定。上线准备度：未评估。

SUT：`0be8575f326f709fe674e20033843d950385043d`；QA：`0be8575f326f709fe674e20033843d950385043d`；run：`2026-10-02T00-31-13.776Z-b7d07e73`。
固定 Node 24.21.0 / npm 12.1.0；Linux 双真实 UID 10001/10002。与 Darwin 宿主证据分开；不修改原 112 条结果。

| 子义务 | 状态 | 原因 / 证据 |
|---|---|---|
| linux-owned-positive-control | PASS | /Users/zcm/.codex/worktrees/qa-third-round/kapibala/qa-acceptance/second-round/reports/runs/2026-10-02T00-31-13.776Z-b7d07e73/foreign-uid/foreign-uid-container-evidence/3-linux-owned-positive-control.json |
| SR-C2-008-foreign-uid-record | PASS | /Users/zcm/.codex/worktrees/qa-third-round/kapibala/qa-acceptance/second-round/reports/runs/2026-10-02T00-31-13.776Z-b7d07e73/foreign-uid/foreign-uid-container-evidence/7-SR-C2-008-foreign-uid-record.json |
| SR-BE-USG-006-safe-temp-positive-control | PASS | /Users/zcm/.codex/worktrees/qa-third-round/kapibala/qa-acceptance/second-round/reports/runs/2026-10-02T00-31-13.776Z-b7d07e73/foreign-uid/foreign-uid-container-evidence/11-SR-BE-USG-006-safe-temp-positive-control.json |
| SR-BE-USG-006-foreign-uid-preservation | PASS | /Users/zcm/.codex/worktrees/qa-third-round/kapibala/qa-acceptance/second-round/reports/runs/2026-10-02T00-31-13.776Z-b7d07e73/foreign-uid/foreign-uid-container-evidence/15-SR-BE-USG-006-foreign-uid-preservation.json |

范围：真实生成会话的不同 UID 拒绝与不重购；安全临时文件正控；不同 UID 临时文件/独立目录/假凭据哨兵保留、可选记录失败时真实业务继续。
不覆盖：整例其余变体、生产 Key 文件配置导入、真实付费模型、真实人类输入法或系统焦点、上线门禁。

资源清理：入口已保存逐资源清理证明；见 cleanup-verification.json 与 foreign-uid/foreign-uid-cleanup.json。
