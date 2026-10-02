import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type {
  Account,
  AgentRun,
  Group,
  Job,
  Message,
  Sequence,
  SequenceRun,
} from "../packages/contracts/src/index.js";

export interface SampleOptions {
  urls: { api: string; web: string; gateway: string; agent: string };
  revision: string | null;
  signal: AbortSignal;
  onProgress(stage: string): void;
}
interface SampleGroup {
  id: string;
  name: string;
  gatewayGroupId: string;
  url: string;
}
interface JobResult extends Job {
  groupId: string | null;
  processing: boolean;
}
interface MessagePage {
  items: Message[];
  nextCursor: string | null;
}
export interface SampleData {
  version: 1;
  preparedAt: string;
  sourceCommit: string | null;
  urls: SampleOptions["urls"];
  groups: Record<"A" | "B" | "C" | "D" | "leave_done", SampleGroup>;
  directoryGroups: SampleGroup[];
  groupCount: number;
  accounts: Pick<Account, "id" | "status">[];
  sequences: Pick<Sequence, "id" | "name">[];
  completedAgentRun: string;
  completedSequenceRun: string;
  historyMessagesSeeded: number;
  agentMode: "simulator";
  isQAExecution: false;
}

// Called only by the owner of a newly created isolated environment. There is no
// standalone URL/reset CLI: each run starts from a fresh, owned database.
export async function prepareSample(
  options: SampleOptions,
): Promise<SampleData> {
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(180_000),
  ]);
  let token: string | undefined;
  let stage = "empty-environment";
  const progress = (next: string) => {
    signal.throwIfAborted();
    stage = next;
    options.onProgress(stage);
  };
  async function request<T>(
    origin: string,
    path: string,
    method = "GET",
    body?: unknown,
    operationSignal = signal,
  ): Promise<T> {
    operationSignal.throwIfAborted();
    const response = await fetch(origin + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(origin === options.urls.api && token
          ? { authorization: `Bearer ${token}` }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([operationSignal, AbortSignal.timeout(10_000)]),
    });
    if (!response.ok)
      throw new Error(
        `${method} ${path} returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    return (await response.json()) as T;
  }
  const api = <T>(path: string, method = "GET", body?: unknown) =>
    request<T>(options.urls.api, path, method, body);
  const inject = <T>(path: string, body: unknown) =>
    request<T>(options.urls.gateway, path, "POST", body);
  async function waitFor<T>(
    description: string,
    read: (pollSignal: AbortSignal) => Promise<T>,
    ready: (value: T) => boolean,
  ): Promise<T> {
    const pollSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
    try {
      for (;;) {
        pollSignal.throwIfAborted();
        const value = await read(pollSignal);
        if (ready(value)) return value;
        await delay(150, undefined, { signal: pollSignal });
      }
    } catch (error) {
      throw new Error(`${description}: ${String(error)}`, { cause: error });
    }
  }
  const getGroup = (id: string, pollSignal = signal) =>
    request<Group>(
      options.urls.api,
      `/api/groups/${id}`,
      "GET",
      undefined,
      pollSignal,
    );
  const jobFinished = (id: string) =>
    waitFor(
      `job ${id}`,
      (pollSignal) =>
        request<JobResult>(
          options.urls.api,
          `/api/jobs/${id}`,
          "GET",
          undefined,
          pollSignal,
        ),
      (job) => {
        assert.equal(job.errors.length, 0, JSON.stringify(job.errors));
        assert.notEqual(job.status, "failed", "job failed");
        assert.ok(
          !job.recoveryNote,
          `job outcome is uncertain: ${job.recoveryNote}`,
        );
        return job.status === "finished" && !job.processing;
      },
    );
  async function createGroup(
    name: string,
    description: string,
    primary = false,
  ): Promise<SampleGroup> {
    const { jobId } = await api<{ jobId: string }>("/api/groups", "POST", {
      name,
      description,
      creatorAccountId: "account-1",
      memberAccountIds: primary
        ? ["account-2", "account-3", "account-4"]
        : ["account-2"],
    });
    const job = await jobFinished(jobId);
    assert.ok(job.groupId, "completed create job must identify its group");
    const group = await getGroup(job.groupId);
    assert.equal(group.status, "active");
    assert.equal(group.name, name);
    assert.equal(group.members.length, primary ? 4 : 2);
    assert.equal(
      group.members.find((m) => m.accountId === "account-2")?.role,
      "admin",
    );
    assert.equal(group.agentEnabled, false);
    if (primary) {
      await inject("/__control/member", {
        groupId: group.gatewayGroupId,
        platformUserId: "sample-external-member",
        joined: true,
      });
      await waitFor(
        "external member arrival",
        (s) => getGroup(group.id, s),
        (g) =>
          g.members.some(
            (m) =>
              m.platformUserId === "sample-external-member" &&
              m.accountId === null,
          ),
      );
    }
    return {
      id: group.id,
      name,
      gatewayGroupId: group.gatewayGroupId,
      url: `${options.urls.web}/#/groups/${group.id}`,
    };
  }
  async function allMessages(
    groupId: string,
    pollSignal = signal,
  ): Promise<Message[]> {
    const items: Message[] = [];
    let cursor: string | null = null;
    do {
      const page: MessagePage = await request(
        options.urls.api,
        `/api/groups/${groupId}/messages?limit=100${cursor ? `&before=${encodeURIComponent(cursor)}` : ""}`,
        "GET",
        undefined,
        pollSignal,
      );
      items.push(...page.items);
      cursor = page.nextCursor;
      assert.ok(
        items.length < 1000,
        "sample message pagination must remain bounded",
      );
    } while (cursor);
    return items;
  }
  try {
    progress(stage);
    const auth = await api<{ accessToken: string }>("/api/auth/login", "POST", {
      username: "admin",
      password: "admin",
    });
    assert.ok(auth.accessToken, "admin login did not return a token");
    token = auth.accessToken;
    assert.equal(
      (await api<Group[]>("/api/groups")).length,
      0,
      "sample preparation requires an empty environment",
    );
    assert.equal(
      (await api<Sequence[]>("/api/sequences")).length,
      0,
      "sample preparation requires no existing templates",
    );
    const initialAccounts = await api<Account[]>("/api/accounts");
    assert.deepEqual(
      initialAccounts.map((a) => [a.id, a.status]),
      Array.from({ length: 6 }, (_, i) => [`account-${i + 1}`, "idle"]),
    );

    progress("connect-accounts");
    for (let i = 1; i <= 4; i++) {
      const account = await api<Account>(
        `/api/accounts/account-${i}/connect`,
        "POST",
        {},
      );
      assert.equal(account.status, "online");
    }
    const directoryGroups: SampleGroup[] = [];
    for (let i = 1; i <= 17; i++) {
      progress(`directory-group-${i}/17`);
      directoryGroups.push(
        await createGroup(
          `目录样例 ${String(i).padStart(2, "0")}`,
          "用于目录搜索、排序与分页；可自由修改。",
        ),
      );
    }
    const groups = {} as SampleData["groups"];
    for (const [key, name, description] of [
      [
        "leave_done",
        "归档样例 · 已退群",
        "已完成退群的对照样例，仅保留一名外部成员。",
      ],
      [
        "D",
        "走查 D · 最后退群",
        "用于体验全员退群；操作后可停止并重建样例环境。",
      ],
      [
        "C",
        "走查 C · 定时序列",
        "用于预览变量、启动定时序列及查看已完成运行。",
      ],
      [
        "B",
        "走查 B · 提醒对照",
        "用于未读提醒和跨群导航对照；准备完成后保持安静。",
      ],
      [
        "A",
        "走查 A · 消息与导航",
        "含 120 条历史消息和一次已完成的模拟 Agent 运行。",
      ],
    ] as const) {
      progress(`primary-group-${key}`);
      groups[key] = await createGroup(name, description, true);
    }
    progress("history-messages");
    const historyStart = Date.now() - 121 * 60_000;
    for (let i = 1; i <= 120; i++) {
      await inject("/__control/message", {
        groupId: groups.A.gatewayGroupId,
        senderPlatformUserId: "sample-external-member",
        msgId: `sample-history-${String(i).padStart(3, "0")}`,
        text: `历史消息 ${String(i).padStart(3, "0")} · 用于查看时间线、加载更早消息和返回最新消息。`,
        sentAt: new Date(historyStart + i * 60_000).toISOString(),
      });
    }
    await waitFor(
      "120 persisted history messages",
      (s) => allMessages(groups.A.id, s),
      (messages) => {
        const history = messages.filter((m) =>
          m.msgId?.startsWith("sample-history-"),
        );
        return (
          history.length === 120 &&
          new Set(history.map((m) => m.msgId)).size === 120
        );
      },
    );

    progress("completed-agent-run");
    await api(`/api/groups/${groups.A.id}`, "PATCH", { agentEnabled: true });
    await inject("/__control/message", {
      groupId: groups.A.gatewayGroupId,
      senderPlatformUserId: "sample-external-member",
      msgId: "sample-agent-trigger",
      text: "请查看最近的消息，并回复一条确认。本次为本地模拟 Agent 样例。",
    });
    const runs = await waitFor(
      "completed simulated Agent run",
      (s) =>
        request<AgentRun[]>(
          options.urls.api,
          `/api/groups/${groups.A.id}/agent-runs`,
          "GET",
          undefined,
          s,
        ),
      (runs) => {
        assert.ok(
          runs.every((r) => r.status === "running" || r.status === "finished"),
          "Agent run did not finish successfully",
        );
        assert.ok(runs.length <= 1, "sample must create exactly one Agent run");
        return runs.length === 1 && runs[0]!.status === "finished";
      },
    );
    const completedAgentRun = runs[0]!.id;
    const agentRun = await api<AgentRun>(
      `/api/agent-runs/${completedAgentRun}`,
    );
    assert.ok(
      agentRun.steps?.some((s) => s.name === "send_message" && !s.isError),
      "Agent must complete a real simulated send",
    );
    await api(`/api/groups/${groups.A.id}`, "PATCH", { agentEnabled: false });

    progress("sequence-templates");
    const definitions: Omit<Sequence, "id">[] = [
      {
        name: "走查 · 两步快速发送",
        steps: [
          {
            index: 1,
            accountRole: "admin",
            text: "快速序列第 1 步：管理员消息。",
            delaySeconds: 0,
          },
          {
            index: 2,
            accountRole: "member",
            text: "快速序列第 2 步：成员消息。",
            delaySeconds: 1,
          },
        ],
      },
      {
        name: "走查 · 变量与来源",
        steps: [
          {
            index: 1,
            accountRole: "admin",
            text: "{topic}：欢迎 {name}。",
            delaySeconds: 0,
          },
          {
            index: 2,
            accountRole: "member",
            text: "{name}，请继续讨论 {topic}。",
            delaySeconds: 2,
          },
        ],
      },
    ];
    const sequences: SampleData["sequences"] = [];
    for (const definition of definitions) {
      const { id } = await api<{ id: string }>(
        "/api/sequences",
        "POST",
        definition,
      );
      sequences.push({ id, name: definition.name });
    }
    progress("completed-sequence-run");
    const { runId: completedSequenceRun } = await api<{ runId: string }>(
      `/api/groups/${groups.C.id}/sequence-runs`,
      "POST",
      { sequenceId: sequences[0]!.id },
    );
    await waitFor(
      "completed sequence with two confirmed sent steps",
      (s) =>
        request<SequenceRun>(
          options.urls.api,
          `/api/sequence-runs/${completedSequenceRun}`,
          "GET",
          undefined,
          s,
        ),
      (run) => {
        assert.ok(
          run.status === "running" || run.status === "finished",
          `sequence ${run.status}`,
        );
        return (
          run.status === "finished" &&
          run.steps.length === 2 &&
          run.steps.every((s) => s.status === "sent" && s.sentAt)
        );
      },
    );
    progress("already-left-group");
    const leave = await api<{ jobId: string }>(
      `/api/groups/${groups.leave_done.id}/leave-all`,
      "POST",
      {},
    );
    await jobFinished(leave.jobId);
    await waitFor(
      "confirmed left group retaining its external member",
      (s) => getGroup(groups.leave_done.id, s),
      (group) =>
        group.status === "left" &&
        group.members.length === 1 &&
        group.members[0]!.platformUserId === "sample-external-member" &&
        group.members[0]!.accountId === null,
    );

    progress("verify-quiet-baseline");
    const accounts = await api<Account[]>("/api/accounts");
    assert.deepEqual(
      accounts.map((a) => [a.id, a.status]),
      Array.from({ length: 6 }, (_, i) => [
        `account-${i + 1}`,
        i < 4 ? "online" : "idle",
      ]),
    );
    const finalGroups = await api<Group[]>("/api/groups");
    assert.equal(finalGroups.length, 22);
    assert.ok(
      finalGroups.every(
        (g) =>
          !g.agentEnabled &&
          !g.autoKickEnabled &&
          !g.activeAgentRunId &&
          !g.activeSequenceRunId,
      ),
      "sample must have no active automation",
    );
    assert.equal(finalGroups.filter((g) => g.status === "active").length, 21);
    assert.deepEqual(
      (await api<Sequence[]>("/api/sequences")).map((s) => ({
        id: s.id,
        name: s.name,
      })),
      sequences,
    );
    const finalMessages = await allMessages(groups.A.id);
    assert.equal(
      finalMessages.filter((m) => m.msgId?.startsWith("sample-history-"))
        .length,
      120,
    );
    assert.equal(
      finalMessages.filter((m) => m.isOwn && m.deliveryStatus === "sent")
        .length,
      1,
    );
    return {
      version: 1,
      preparedAt: new Date().toISOString(),
      sourceCommit: options.revision,
      urls: options.urls,
      groups,
      directoryGroups,
      groupCount: finalGroups.length,
      accounts: accounts.map(({ id, status }) => ({ id, status })),
      sequences,
      completedAgentRun,
      completedSequenceRun,
      historyMessagesSeeded: 120,
      agentMode: "simulator",
      isQAExecution: false,
    };
  } catch (error) {
    throw new Error(`Sample preparation failed at ${stage}: ${String(error)}`, {
      cause: error,
    });
  }
}
