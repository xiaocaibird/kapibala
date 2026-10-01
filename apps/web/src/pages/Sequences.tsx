import {
  PageAttentionScope,
  AttentionRegion,
  useAttentionCollection,
  type SnapshotEvidence,
} from "../attention";
import {
  acceptsSequencePageEvent,
  definitiveSequenceSelectionEvent,
  groupFields,
} from "../attention/pageAdapters";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { z } from "zod";
import {
  sequenceDefinitionRequestSchema,
  sequenceVariablesSchema,
  sequenceStepVariablesSchema,
  sequenceStartRequestSchema,
  type SequenceStartRequest,
} from "../../../../packages/contracts/src/sequence-requests";
import { ApiError, getSessionGeneration, post } from "../api/client";
import {
  groupSchema,
  sequenceSchema,
  previewSchema,
  runIdSchema,
  idSchema,
  type Preview,
  type Sequence,
} from "../api/schemas";
import { useResource } from "../hooks/useResource";
import { useAuth } from "../state/auth";
import { useGroupFormGuard } from "../hooks/useGroupFormGuard";
import { GroupDiscardPrompt } from "../components/GroupDiscardPrompt";
import {
  Badge,
  Empty,
  ErrorNotice,
  Icon,
  JsonView,
  Loading,
  Modal,
  PageHeader,
} from "../components/ui";
import { SequenceProgress } from "../components/SequenceProgress";
const groupsSchema = groupSchema.array();
const sequencesSchema = sequenceSchema.array();
const runIdsSchema = z.record(z.string(), z.string());
interface PreviewState {
  groupId: string;
  groupLabel: string;
  sequence: Sequence;
  revision: number;
  session: number;
  payload: SequenceStartRequest;
  result: Preview;
}
function parseInput<T>(text: string, schema: z.ZodType<T>, name: string): T {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new ApiError("VALIDATION_ERROR", `${name}必须为合法 JSON。`, 400);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ApiError(
      "VALIDATION_ERROR",
      `${name}格式不正确：${parsed.error.issues[0]?.path.join(".") || "根对象"}。请检查字段和值的类型。`,
      400,
    );
  return parsed.data;
}
export function Sequences({
  groupId: requestedGroup,
}: {
  groupId: string | null;
}) {
  const { user } = useAuth();
  const groups = useResource("/api/groups", groupsSchema, 3_000);
  const sequences = useResource("/api/sequences", sequencesSchema);
  const [groupChoice, setGroupChoice] = useState(requestedGroup ?? "");
  const [sequenceChoice, setSequenceChoice] = useState("");
  const [varsText, setVarsText] = useState("{}");
  const [stepVarsText, setStepVarsText] = useState("{}");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [contextNotice, setContextNotice] = useState<string | null>(null);
  const contextRevision = useRef(0);
  const pending = useRef<"preview" | "start" | null>(null);
  const mounted = useRef(false);
  const [runIds, setRunIds] = useState<Record<string, string>>(() => {
    try {
      const raw: unknown = JSON.parse(
        sessionStorage.getItem("kapibala:sequenceRuns") ?? "{}",
      );
      return runIdsSchema.parse(raw);
    } catch {
      return {};
    }
  });
  const [createOpen, setCreateOpen] = useState(false);
  // Default only before a choice exists. Missing explicit IDs (including URL
  // targets) remain selected so refreshes cannot silently retarget a write.
  const groupId = groupChoice || (groups.data?.[0]?.id ?? "");
  const sequenceId = sequenceChoice || (sequences.data?.[0]?.id ?? "");
  const group = groups.data?.find((item) => item.id === groupId);
  const sequence = sequences.data?.find((item) => item.id === sequenceId);
  const groupMissing = Boolean(groupChoice && groups.data && !group);
  const sequenceMissing = Boolean(
    sequenceChoice && sequences.data && !sequence,
  );
  useLayoutEffect(() => {
    if (!groupChoice && groupId) setGroupChoice(groupId);
    if (!sequenceChoice && sequenceId) setSequenceChoice(sequenceId);
  }, [groupChoice, groupId, sequenceChoice, sequenceId]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      contextRevision.current++;
    };
  }, []);
  const contextKey = JSON.stringify([
    groupId,
    group?.name,
    group?.gatewayGroupId,
    group?.status,
    group?.activeSequenceRunId,
    group?.members,
    sequenceId,
    sequence,
    varsText,
    stepVarsText,
    user?.username,
    user?.role,
  ]);
  const previousContext = useRef(contextKey);
  const invalidatePreview = (): void => {
    contextRevision.current++;
    if (pending.current !== "start") {
      setPreview(null);
      setError(null);
      setContextNotice("配置已变更，请重新预检。变量草稿已保留。");
    }
  };
  useLayoutEffect(() => {
    if (previousContext.current !== contextKey) {
      previousContext.current = contextKey;
      contextRevision.current++;
      if (
        pending.current !== "start" &&
        (preview || pending.current === "preview")
      ) {
        setPreview(null);
        setError(null);
        setContextNotice("目标或配置已更新，请重新预检。变量草稿已保留。");
      }
    }
  }, [contextKey, preview]);
  const runId = group?.activeSequenceRunId ?? runIds[groupId];
  // Retain the latest displayed run after it becomes terminal. A later active run
  // replaces it within the same page scope, whose summary records that replacement.
  useEffect(() => {
    if (
      !group?.activeSequenceRunId ||
      runIds[groupId] === group.activeSequenceRunId
    )
      return;
    const activeId = group.activeSequenceRunId;
    setRunIds((current) => {
      const next = { ...current, [groupId]: activeId };
      sessionStorage.setItem("kapibala:sequenceRuns", JSON.stringify(next));
      return next;
    });
  }, [groupId, group?.activeSequenceRunId, runIds]);
  const placeholders = useMemo(
    () => [
      ...new Set(
        sequence?.steps.flatMap((step) =>
          [...step.text.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
            .map((match) => match[1])
            .filter((key): key is string => Boolean(key)),
        ) ?? [],
      ),
    ],
    [sequence],
  );
  const preflight = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (
      pending.current ||
      !group ||
      !sequence ||
      group.status !== "active" ||
      group.activeSequenceRunId ||
      user?.role !== "admin"
    )
      return;
    pending.current = "preview";
    const revision = contextRevision.current;
    const session = getSessionGeneration();
    const isCurrent = () =>
      mounted.current &&
      contextRevision.current === revision &&
      getSessionGeneration() === session;
    setBusy(true);
    setError(null);
    setContextNotice(null);
    try {
      const payload = sequenceStartRequestSchema.parse({
        sequenceId,
        vars: parseInput(varsText, sequenceVariablesSchema, "默认变量"),
        stepVars: parseInput(
          stepVarsText,
          sequenceStepVariablesSchema,
          "分步变量",
        ),
      });
      const result = await post(
        "/api/sequences/preview",
        previewSchema,
        payload,
      );
      if (isCurrent())
        setPreview({
          groupId,
          groupLabel: groupOptionLabel(group),
          sequence,
          payload,
          result,
          revision,
          session,
        });
    } catch (value) {
      if (isCurrent()) setError(value);
    } finally {
      pending.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  const start = async (): Promise<void> => {
    if (!preview || pending.current) return;
    if (
      preview.revision !== contextRevision.current ||
      preview.session !== getSessionGeneration() ||
      !group ||
      !sequence ||
      group.status !== "active" ||
      group.activeSequenceRunId ||
      user?.role !== "admin"
    ) {
      invalidatePreview();
      return;
    }
    pending.current = "start";
    setBusy(true);
    setError(null);
    try {
      const result = await post(
        `/api/groups/${encodeURIComponent(preview.groupId)}/sequence-runs`,
        runIdSchema,
        preview.payload,
      );
      if (!mounted.current || preview.session !== getSessionGeneration())
        return;
      setRunIds((current) => {
        const next = { ...current, [preview.groupId]: result.runId };
        sessionStorage.setItem("kapibala:sequenceRuns", JSON.stringify(next));
        return next;
      });
      setPreview(null);
      await groups.reload();
    } catch (value) {
      if (mounted.current && preview.session === getSessionGeneration())
        setError(value);
    } finally {
      pending.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <PageAttentionScope
      key={`${groupId}:${sequenceId}`}
      scopeKey={`sequences:${groupId}:${sequenceId}`}
      title="定时序列"
      acceptEvent={(event) => acceptsSequencePageEvent(event, groupId)}
    >
      <PageHeader
        eyebrow="SCHEDULED MESSAGING"
        title="定时序列"
        subtitle="预检每一步的消息与变量来源，再有序发送到群组。"
        actions={
          user?.role === "admin" && (
            <button
              className="button secondary"
              onClick={() => setCreateOpen(true)}
            >
              <Icon name="plus" size={16} />
              新建序列
            </button>
          )
        }
      />
      <ErrorNotice error={groups.error} retry={() => void groups.reload()} />
      <ErrorNotice
        error={sequences.error}
        retry={() => void sequences.reload()}
      />
      <ErrorNotice error={preview ? null : error} />
      {contextNotice && (
        <p className="notice info" role="status">
          {contextNotice}
        </p>
      )}
      {(groupMissing || sequenceMissing) && (
        <p className="notice warning" role="status">
          原选择的{groupMissing ? "群组" : "序列"}
          已不可用，请重新选择。不会自动切换到其他目标。
        </p>
      )}
      <AttentionRegion
        targetId="sequence-selection"
        label="当前选择的群状态或运行有更新"
        matchEvent={(event) =>
          groupFields(event, groupId, ["name", "status"]) ||
          (event.type === "sequence_run" && event.payload.groupId === groupId)
        }
        definitiveEvent={definitiveSequenceSelectionEvent}
        version={JSON.stringify([group?.name, group?.status, runId])}
        evidence={groups.snapshot}
        ready={Boolean(group) && !groups.error}
        refresh={groups.reload}
      >
        <p className="muted">
          当前群组：{group ? groupOptionLabel(group) : "未选择"} · 状态：
          {group?.status ?? "—"}
        </p>
        <p className="mono small">当前展示运行：{runId ?? "尚无运行"}</p>
      </AttentionRegion>
      <SequenceChoicesAttention
        data={sequences.data}
        evidence={sequences.snapshot}
        ready={sequences.data !== null && !sequences.error}
        refresh={sequences.reload}
      />
      <div className="sequence-layout">
        <section className="panel">
          <div className="panel-header">
            <h2>运行配置</h2>
            <span className="muted small">先预检 · 后执行</span>
          </div>
          <form
            className="sequence-form"
            onSubmit={(event) => void preflight(event)}
          >
            <label>
              目标群组
              <select
                value={groupId}
                onChange={(event) => {
                  invalidatePreview();
                  setGroupChoice(event.target.value);
                  setError(null);
                }}
                required
              >
                <option value="" disabled>
                  请选择群组
                </option>
                {groupMissing && (
                  <option value={groupId} disabled>
                    {groupId}（已不可用，请重新选择）
                  </option>
                )}
                {groups.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {groupOptionLabel(item)} ·{" "}
                    {item.status === "active" ? "可用" : "不可用"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              消息序列
              <select
                value={sequenceId}
                onChange={(event) => {
                  invalidatePreview();
                  setSequenceChoice(event.target.value);
                  setError(null);
                }}
                required
              >
                <option value="" disabled>
                  请选择序列
                </option>
                {sequenceMissing && (
                  <option value={sequenceId} disabled>
                    {sequenceId}（已不可用，请重新选择）
                  </option>
                )}
                {sequences.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.steps.length} 步
                  </option>
                ))}
              </select>
            </label>
            {sequences.loading && !sequence && <Loading />}
            {sequence && (
              <AttentionRegion
                targetId="sequence-definition"
                label="当前序列定义有更新"
                matchEvent={(event) =>
                  event.type === "sequence_definition_changed" &&
                  event.payload.sequenceId === sequenceId
                }
                version={JSON.stringify(sequence)}
                evidence={sequences.snapshot}
                ready={!sequences.error}
                refresh={sequences.reload}
              >
                <div className="sequence-definition">
                  {sequence.steps.map((step) => (
                    <div key={step.index}>
                      <span className="step-number">{step.index}</span>
                      <div>
                        <strong>{step.text}</strong>
                        <span>
                          {step.accountRole === "admin"
                            ? "管理员 / 群主"
                            : "普通成员"}{" "}
                          · 延迟 {step.delaySeconds} 秒
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </AttentionRegion>
            )}
            {user?.role === "admin" && (
              <>
                <label>
                  默认变量 <code>vars</code>
                  <textarea
                    className="code-input"
                    rows={5}
                    value={varsText}
                    onChange={(event) => {
                      invalidatePreview();
                      setVarsText(event.target.value);
                    }}
                    spellCheck={false}
                    aria-describedby="vars-help"
                  />
                </label>
                <p id="vars-help" className="field-help">
                  JSON 键值对象。
                  {placeholders.length
                    ? `需要的占位符：${placeholders.join("、")}。`
                    : "此序列没有占位符。"}
                  空字符串视为未提供。
                </p>
                <label>
                  分步变量 <code>stepVars</code>
                  <textarea
                    className="code-input"
                    rows={5}
                    value={stepVarsText}
                    onChange={(event) => {
                      invalidatePreview();
                      setStepVarsText(event.target.value);
                    }}
                    spellCheck={false}
                    aria-describedby="step-vars-help"
                  />
                </label>
                <p id="step-vars-help" className="field-help">
                  例如 <code>{'{"2":{"location":"共享盘"}}'}</code>
                  。从该步起沿用新值；空字符串保留原值。
                </p>
                {group?.activeSequenceRunId && (
                  <div className="notice warning">
                    此群已有序列运行中，请等待完成。
                  </div>
                )}
                <button
                  className="button primary full-width"
                  disabled={
                    busy ||
                    !sequenceId ||
                    !groupId ||
                    !sequence ||
                    group?.status !== "active" ||
                    Boolean(group?.activeSequenceRunId)
                  }
                >
                  {busy ? "正在预检…" : "预检所有步骤"}
                  <Icon name="arrow" size={16} />
                </button>
              </>
            )}
            {user?.role === "viewer" && (
              <div className="notice info">
                当前为只读会话，可查看序列与执行进度。
              </div>
            )}
          </form>
        </section>
        <div>
          {runId ? (
            <SequenceProgress key={runId} id={runId} />
          ) : (
            <section className="panel">
              <Empty title="尚无序列运行" icon="sequence">
                选择序列并完成变量预检后，执行进度会在这里实时展示。
              </Empty>
            </section>
          )}
          <div className="sequence-note">
            <h3>发送后，再开始下一步计时</h3>
            <p>
              限流时步骤等待恢复。没有匹配角色的可用账号时跳过；群不可写时停止运行。
            </p>
          </div>
        </div>
      </div>
      {preview && (
        <Modal
          wide
          title="预检通过 · 确认发送内容"
          onClose={() => {
            if (!busy) setPreview(null);
          }}
        >
          <p className="muted">
            以下是每一步的最终文本和变量来源。启动时服务会再次完整校验。
          </p>
          <div className="notice info">
            <strong>目标群组：{preview.groupLabel}</strong>
            <span>群 ID：{preview.groupId}</span>
            <span>
              消息序列：{preview.sequence.name} · {preview.sequence.id}
            </span>
            <span>角色可用性以执行时为准；没有匹配账号时仍按原规则跳过。</span>
          </div>
          <ErrorNotice error={error} />
          <div className="preview-steps">
            {preview.result.steps.map((step) => (
              <article key={step.index} className="preview-step">
                <div className="split">
                  <h3>第 {step.index} 步</h3>
                  <Badge status="pass" />
                </div>
                <p className="preview-text">{step.text}</p>
                <p className="muted small">
                  {preview.sequence.steps.find(
                    (item) => item.index === step.index,
                  )?.accountRole === "admin"
                    ? "管理员 / 群主"
                    : "普通成员"}
                  {" · "}相对等待{" "}
                  {
                    preview.sequence.steps.find(
                      (item) => item.index === step.index,
                    )?.delaySeconds
                  }{" "}
                  秒
                  {step.index === 1
                    ? "（从运行启动计）"
                    : "（从前一步完成计，发出步骤以发送确认为准）"}
                </p>
                {Object.keys(step.resolvedVars).length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>变量</th>
                        <th>最终取值</th>
                        <th>来源</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(step.resolvedVars).map(([key, value]) => (
                        <tr key={key}>
                          <td>
                            <code>{key}</code>
                          </td>
                          <td>{value}</td>
                          <td>{sourceLabel(step.varSources[key] ?? "")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted small">此步骤不使用变量。</p>
                )}
              </article>
            ))}
          </div>
          <div className="modal-footer">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              返回编辑
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void start()}
            >
              {busy ? "正在启动…" : "确认启动序列"}
            </button>
          </div>
        </Modal>
      )}
      {createOpen && (
        <CreateSequence
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            invalidatePreview();
            setSequenceChoice(id);
            setCreateOpen(false);
            void sequences.reload();
          }}
        />
      )}
    </PageAttentionScope>
  );
}
function SequenceChoicesAttention({
  data,
  evidence,
  ready,
  refresh,
}: {
  data: Sequence[] | null;
  evidence: SnapshotEvidence | null;
  ready: boolean;
  refresh: () => Promise<void>;
}) {
  const attention = useAttentionCollection({
    targetId: "sequence-choices",
    label: "可选序列列表有更新",
    eventKey: (event) =>
      event.type === "sequence_definition_changed" &&
      typeof event.payload.sequenceId === "string"
        ? event.payload.sequenceId
        : null,
    versions: Object.fromEntries(
      (data ?? []).map((sequence) => [
        sequence.id,
        JSON.stringify([sequence.name, sequence.steps.length]),
      ]),
    ),
    evidence,
    ready,
    refresh,
    rangeFallback: true,
    renderRangeSummary: () =>
      data && (
        <div>
          <strong>当前可选序列：{data.length} 个</strong>
          {data.slice(0, 5).map((sequence) => (
            <p key={sequence.id}>
              {sequence.name} · {sequence.steps.length} 步
            </p>
          ))}
          {data.length > 5 && (
            <p>另有 {data.length - 5} 个，可在选择框中查看。</p>
          )}
          {!data.length && <p>当前没有可选序列。</p>}
        </div>
      ),
  });
  // Collapsed native options are not evidence that their contents were seen.
  // A successful explicit refresh confirms only the selectable range summary.
  return attention.notice;
}
function sourceLabel(source: string): string {
  return source === "default"
    ? "默认变量"
    : source.startsWith("step:")
      ? `第 ${source.slice(5)} 步赋值`
      : source;
}
function CreateSequence({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [text, setText] = useState(
    JSON.stringify(
      {
        name: "活动提醒",
        steps: [
          {
            index: 1,
            accountRole: "admin",
            text: "{event} 将于 {time} 开始，请提前准备",
            delaySeconds: 10,
          },
          {
            index: 2,
            accountRole: "member",
            text: "提醒：{event} 的资料已上传到 {location}",
            delaySeconds: 5,
          },
        ],
      },
      null,
      2,
    ),
  );
  const initialText = useRef(text);
  const guard = useGroupFormGuard(text !== initialText.current, onClose);
  const { busy } = guard;
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await guard.submit(async (isCurrent) => {
      const value = parseInput(
        text,
        sequenceDefinitionRequestSchema,
        "序列定义",
      );
      const result = await post("/api/sequences", idSchema, value);
      if (isCurrent()) onCreated(result.id);
    });
  };
  return (
    <Modal wide title="新建消息序列" onClose={guard.close}>
      <form onSubmit={(event) => void submit(event)}>
        <p className="muted">
          定义角色、消息模板和每一步的延迟。保存序列不会立即发送消息。
        </p>
        <ErrorNotice error={guard.error} />
        <label>
          序列 JSON
          <textarea
            className="code-input"
            rows={16}
            spellCheck={false}
            value={text}
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
            required
          />
        </label>
        <details>
          <summary>支持的字段</summary>
          <JsonView
            value={{
              name: "序列名称",
              steps: [
                {
                  index: "从 1 起的步骤序号",
                  accountRole: "admin 或 member",
                  text: "消息内容，支持 {key}",
                  delaySeconds: "距前一步发出后的等待秒数",
                },
              ],
            }}
          />
        </details>
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={guard.close}
          >
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "保存中…" : "保存序列"}
          </button>
        </div>
      </form>
      {guard.confirmDiscard && (
        <GroupDiscardPrompt
          onContinue={guard.continueEditing}
          onDiscard={guard.discard}
        />
      )}
    </Modal>
  );
}
import { groupOptionLabel } from "../api/groupProfile";
