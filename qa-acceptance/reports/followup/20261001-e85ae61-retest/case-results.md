# 本轮逐项结果

仅本次固定 e85 候选的 30 项，未导入历史通过。首次结果及两项复测关联见 summary.json；完整执行史有 32 条。

| 用例 | 项目 | 项目状态 | 原始整用例汇总 | 需求 | QA提交 | 本轮来源 |
| --- | --- | --- | --- | --- | --- | --- |
| AGENT-025 run reaches sixty-second active wall-clock budget including slow turns | system | FAIL | FAIL | R-A5-06 | `105ed28` | [2026-10-01T12-23-10.195Z-e84c34eb](runs/2026-10-01T12-23-10.195Z-e84c34eb/events.json) |
| AGENT-028 unknown send times out in five seconds and same key still cannot resend | system | FAIL | FAIL | R-A5-10, R-A5-16 | `105ed28` | [2026-10-01T12-23-10.195Z-e84c34eb](runs/2026-10-01T12-23-10.195Z-e84c34eb/events.json) |
| ARC-UI-015 耗尽后显式同页刷新可开始新一轮 | chromium | PASS | PASS | ENG-READ-01 | `526d814` | [2026-10-01T12-46-08.250Z-9b50fc8a](runs/2026-10-01T12-46-08.250Z-9b50fc8a/events.json) |
| AUTH-001 health, login and UTC account contract | system | PASS | PASS | R-A0-04, R-A0-06 | `105ed28` | [2026-10-01T12-21-58.171Z-627cb313](runs/2026-10-01T12-21-58.171Z-627cb313/events.json) |
| AUTH-002 protected reads reject missing and invalid credentials | system | PASS | PASS | R-A0-03, R-A0-04 | `105ed28` | [2026-10-01T12-21-58.171Z-627cb313](runs/2026-10-01T12-21-58.171Z-627cb313/events.json) |
| AUTH-003 viewer cannot execute any original business write endpoint | system | PASS | PASS | R-A0-05 | `105ed28` | [2026-10-01T12-21-58.171Z-627cb313](runs/2026-10-01T12-21-58.171Z-627cb313/events.json) |
| AUTH-006 logout invalidates the existing access token immediately | system | PASS | PASS | R-B3-03 | `105ed28` | [2026-10-01T12-21-58.171Z-627cb313](runs/2026-10-01T12-21-58.171Z-627cb313/events.json) |
| BLK-EXT-001 未收到响应的发送崩溃：相同前缀下落地/不落地两个分支 | system | BLOCKED | BLOCKED | R-A2-01, R-A5-11 | `105ed28` | [2026-10-01T12-23-10.195Z-e84c34eb](runs/2026-10-01T12-23-10.195Z-e84c34eb/events.json) |
| CAP-001 确证容量拒绝后零远端且释放后同一步只审计/踢人一次 | system | PASS | PASS | ENG-ADMISSION-01, R-A5-05, R-A5-07, R-A5-09 | `105ed28` | [2026-10-01T12-34-40.057Z-b8ab8bd7](runs/2026-10-01T12-34-40.057Z-b8ab8bd7/events.json) |
| CAP-003 持续容量拒绝计入原 60 秒活动预算 | system | FAIL | FAIL | ENG-ADMISSION-01, R-A5-05, R-A5-06 | `105ed28` | [2026-10-01T12-34-40.057Z-b8ab8bd7](runs/2026-10-01T12-34-40.057Z-b8ab8bd7/events.json) |
| CAP-009 容量已拒绝但 ready 持久化之前崩溃的恢复 | system | PASS | PASS | ENG-ADMISSION-01, R-A5-11 | `105ed28` | [2026-10-01T12-34-40.057Z-b8ab8bd7](runs/2026-10-01T12-34-40.057Z-b8ab8bd7/events.json) |
| CAP-010 已派发且2秒内收敛的504踢人遇容量压力不退回重放 | system | PASS | PASS | ENG-ADMISSION-01, R-A5-09, R-A5-11 | `105ed28` | [2026-10-01T12-34-40.057Z-b8ab8bd7](runs/2026-10-01T12-34-40.057Z-b8ab8bd7/events.json) |
| CAP-REG-001 不同群同名目标的重叠 kick 保持各自审计、步骤和副作用唯一 | system | PASS | PASS | R-A5-01, R-A5-07, R-A5-08, R-A5-09 | `105ed28` | [2026-10-01T12-34-40.057Z-b8ab8bd7](runs/2026-10-01T12-34-40.057Z-b8ab8bd7/events.json) |
| CAP-REG-002 审计等待期间关闭 autoKick 后不得继续派发 | system | PASS | PASS | R-A5-07, R-A5-09 | `105ed28` | [2026-10-01T12-34-40.057Z-b8ab8bd7](runs/2026-10-01T12-34-40.057Z-b8ab8bd7/events.json) |
| CAP-REG-003 审计等待后重新检查执行账号在线状态 | system | PASS | PASS | R-A5-07, R-A5-08 | `105ed28` | [2026-10-01T12-34-40.057Z-b8ab8bd7](runs/2026-10-01T12-34-40.057Z-b8ab8bd7/events.json) |
| CAP-REG-004 审计等待后成员身份和管理员角色均重新检查 | system | PASS | PASS | R-A5-07, R-A5-08 | `105ed28` | [2026-10-01T12-34-40.057Z-b8ab8bd7](runs/2026-10-01T12-34-40.057Z-b8ab8bd7/events.json) |
| INT-ACT-001 安全阶段重启累计活动预算、恢复归因与完整尾段真值 | system | BLOCKED | BLOCKED | R-A5-06, R-A5-11 | `105ed28` | [2026-10-01T12-23-10.195Z-e84c34eb](runs/2026-10-01T12-23-10.195Z-e84c34eb/events.json) |
| INT-STREAM-001 真实暂停TCP读取与健康消费者并行、按实际已收游标重放 | system | PASS | PASS | ENG-STREAM-01, R-A4-03, R-A4-04 | `526d814` | [2026-10-01T12-46-08.250Z-9b50fc8a](runs/2026-10-01T12-46-08.250Z-9b50fc8a/events.json) |
| INT-STREAM-002 续页改变页大小并交错发送确认、历史补投与新消息，冻结集合内容保持 | system | PASS | PASS | ENG-STREAM-01, R-A4-01, R-A4-02 | `526d814` | [2026-10-01T12-46-08.250Z-9b50fc8a](runs/2026-10-01T12-46-08.250Z-9b50fc8a/events.json) |
| MSG-001 accepted is observable until message_sent and own echo stays one row | system | PASS | PASS | R-A2-01, R-A2-02, R-A2-06 | `105ed28` | [2026-10-01T12-21-58.171Z-627cb313](runs/2026-10-01T12-21-58.171Z-627cb313/events.json) |
| SEQ-001 variables inherit latest nonempty override with original source | system | PASS | PASS | R-B1-03, R-B1-05 | `105ed28` | [2026-10-01T12-21-58.171Z-627cb313](runs/2026-10-01T12-21-58.171Z-627cb313/events.json) |
| UI-008 登录至Agent步骤详情完整旅程 | chromium | PASS | NOT_RUN | R-B4-02, R-A5-14 | `105ed28` | [2026-10-01T12-32-51.059Z-057b2c09](runs/2026-10-01T12-32-51.059Z-057b2c09/events.json) |
| UI-016 搜索迟到响应隔离 | chromium | PASS | PASS | ADD-DIR-11 | `105ed28` | [2026-10-01T12-32-51.059Z-057b2c09](runs/2026-10-01T12-32-51.059Z-057b2c09/events.json) |
| UI-020 失焦提醒和呈现后确认 | chromium | PASS | PASS | ADD-ATT-01, ADD-ATT-02, ADD-ATT-03 | `105ed28` | [2026-10-01T12-32-51.059Z-057b2c09](runs/2026-10-01T12-32-51.059Z-057b2c09/events.json) |
| UI-028 前台安静与失焦静态标题favicon | chromium | PASS | PASS | ADD-ATT-02, ADD-ATT-03 | `105ed28` | [2026-10-01T12-32-51.059Z-057b2c09](runs/2026-10-01T12-32-51.059Z-057b2c09/events.json) |
| UI-030 列表范围消失的两阶段确认 | chromium | PASS | PASS | ADD-ATT-01, ADD-ATT-04 | `105ed28` | [2026-10-01T12-32-51.059Z-057b2c09](runs/2026-10-01T12-32-51.059Z-057b2c09/events.json) |
| UI-031 变化后回原值保留期间变化候选 | chromium | PASS | PASS | ADD-ATT-04 | `105ed28` | [2026-10-01T12-32-51.059Z-057b2c09](runs/2026-10-01T12-32-51.059Z-057b2c09/events.json) |
| UI-032 提示确认与目录过期相互独立 | chromium | BLOCKED | BLOCKED | ADD-ATT-05, ADD-DIR-08 | `105ed28` | [2026-10-01T12-31-30.250Z-1384f257](runs/2026-10-01T12-31-30.250Z-1384f257/events.json) |
| UI-034 Agent自动消息失焦提醒 | chromium | PASS | PASS | ADD-ATT-06 | `105ed28` | [2026-10-01T12-32-51.059Z-057b2c09](runs/2026-10-01T12-32-51.059Z-057b2c09/events.json) |
| UI-035 序列自动消息失焦提醒 | chromium | PASS | PASS | ADD-ATT-06 | `105ed28` | [2026-10-01T12-32-51.059Z-057b2c09](runs/2026-10-01T12-32-51.059Z-057b2c09/events.json) |

UI-008 仅 Chromium 项目通过；Firefox/WebKit 本轮未选取，所以该轮原始整用例汇总仍为 NOT_RUN。此表不关闭其跨浏览器义务。
