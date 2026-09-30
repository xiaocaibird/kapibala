import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../state/auth";
import {
  Badge,
  DateTime,
  Empty,
  ErrorNotice,
  Icon,
  Loading,
  PageHeader,
} from "../components/ui";
import { CreateGroup } from "../components/CreateGroup";
import { JobProgress } from "../components/JobProgress";
import { useGroupDirectory } from "../directory/GroupDirectoryProvider";
import { directoryMatch } from "../directory/presentation";
import {
  groupDirectoryPath,
  type DirectoryPosition,
} from "../directory/controller";
import {
  PageAttentionScope,
  useAttentionCollection,
  isDefinitiveBusinessEvent,
} from "../attention";
import { eventEntity, groupFields } from "../attention/pageAdapters";

export function Groups() {
  const { user } = useAuth();
  const { controller, state } = useGroupDirectory();
  const [createOpen, setCreateOpen] = useState(false);
  const composing = useRef(false);
  const pendingQuery = state.composing || state.input.trim() !== state.q;
  const busy = state.loading !== null;
  const refresh = () => {
    void controller.refresh();
  };
  useEffect(() => {
    controller.setVisible(true);
    const interval = setInterval(() => void controller.poll(), 5_000);
    return () => {
      clearInterval(interval);
      controller.setVisible(false);
    };
  }, [controller]);
  // Query controls retain their DOM/focus when the result attention scope changes.
  return (
    <>
      <PageHeader
        eyebrow="GROUP WORKSPACE"
        title="群组工作台"
        subtitle="按创建时间浏览群组，或搜索名称、简介和群 ID。"
        actions={
          user?.role === "admin" && (
            <button
              className="button primary"
              onClick={() => setCreateOpen(true)}
            >
              <Icon name="plus" size={18} />
              创建群组
            </button>
          )
        }
      />
      <section className="panel directory-tools" aria-label="群列表查找与排序">
        <label className="directory-search">
          搜索群组
          <input
            type="search"
            value={state.input}
            placeholder="名称、简介、网关群 ID 或平台群 ID"
            onCompositionStart={() => {
              composing.current = true;
              controller.setInput(state.input, true);
            }}
            onCompositionEnd={(event) => {
              composing.current = false;
              controller.setInput(event.currentTarget.value);
            }}
            onChange={(event) =>
              controller.setInput(event.target.value, composing.current)
            }
            aria-describedby="directory-search-help"
          />
        </label>
        <button
          className="button secondary"
          disabled={!state.input}
          onClick={() => {
            composing.current = false;
            controller.clearSearch();
          }}
        >
          清除搜索
        </button>
        <label>
          创建时间
          <select
            value={state.order}
            onChange={(event) =>
              controller.setOrder(event.target.value === "asc" ? "asc" : "desc")
            }
          >
            <option value="desc">新到旧</option>
            <option value="asc">旧到新</option>
          </select>
        </label>
        <button
          className="button secondary"
          disabled={busy || pendingQuery}
          onClick={refresh}
        >
          <Icon name="refresh" size={16} />
          {state.loading === "refresh" ? "正在刷新…" : "刷新列表"}
        </button>
        <p className="muted small directory-help" id="directory-search-help">
          搜索完整群目录；忽略首尾空白与英文大小写，按整段关键词匹配。
        </p>
      </section>
      <PageAttentionScope
        scopeKey={`directory:${groupDirectoryPath(state)}`}
        acceptEvent={(event) =>
          [
            "group_changed",
            "agent_run",
            "sequence_run",
            "job_changed",
          ].includes(event.type)
        }
        title="群组工作台 · Kapibala"
      >
        <GroupDirectoryView
          createOpen={createOpen}
          setCreateOpen={setCreateOpen}
        />
      </PageAttentionScope>
    </>
  );
}

function GroupDirectoryView({
  createOpen,
  setCreateOpen,
}: {
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { controller, state } = useGroupDirectory();
  const grid = useRef<HTMLDivElement>(null);
  const clickedPosition = useRef<DirectoryPosition | null>(null);
  const restored = useRef<string | null>(null);
  const queryKey = groupDirectoryPath(state);
  const pendingQuery = state.composing || state.input.trim() !== state.q;
  const busy = state.loading !== null;
  const attention = useAttentionCollection({
    targetId: "directory",
    label: "当前群目录可能有变化",
    eventKey: (event) => {
      const id = eventEntity(
        event,
        ["group_changed", "agent_run", "sequence_run"],
        "groupId",
      );
      if (!id) return null;
      if (
        event.type === "group_changed" &&
        !groupFields(event, id, [
          "name",
          "description",
          "status",
          "members",
          "agentEnabled",
          "created",
        ])
      )
        return null;
      return id;
    },
    definitiveEvent: (event) =>
      event.type === "group_changed" && isDefinitiveBusinessEvent(event),
    renderRangeSummary: () => (
      <div>
        <strong>当前查询的最新结果</strong>
        <p>
          搜索：{state.q || "全部关键词"}；创建时间：
          {state.order === "desc" ? "新到旧" : "旧到新"}。
        </p>
        <p>
          {state.items.length
            ? `当前显示 ${state.items.length} 个群：${state.items.map((group) => group.name ?? group.gatewayGroupId).join("、")}`
            : "当前查询没有匹配的群。"}
        </p>
        <p>
          {state.nextCursor
            ? "后续结果可继续加载；本次确认当前查询范围已刷新，不表示逐条查看全部群。"
            : "当前查询结果已全部返回。"}
        </p>
      </div>
    ),
    versions: Object.fromEntries(
      state.items.map((group) => [group.id, JSON.stringify(group)]),
    ),
    evidence: state.snapshot,
    ready: state.initialized && !state.stale && !state.error && !pendingQuery,
    refresh: () => controller.refresh(),
    rangeFallback: true,
  });
  useEffect(() => {
    clickedPosition.current = null;
  }, [queryKey]);
  useLayoutEffect(
    () => () => {
      if (groupDirectoryPath(controller.getSnapshot()) !== queryKey) return;
      const cards = [
        ...(grid.current?.querySelectorAll<HTMLElement>(
          "[data-directory-group-id]",
        ) ?? []),
      ];
      const first = cards.find(
        (card) => card.getBoundingClientRect().bottom > 80,
      );
      const position =
        clickedPosition.current ??
        (first
          ? {
              groupId: first.dataset.directoryGroupId!,
              offset: first.getBoundingClientRect().top,
              scrollY: window.scrollY,
            }
          : null);
      if (position) controller.rememberPosition(position);
    },
    [controller, queryKey],
  );
  useLayoutEffect(() => {
    if (!state.initialized || restored.current === queryKey) return;
    restored.current = queryKey;
    const position = state.position;
    const card = position
      ? [
          ...(grid.current?.querySelectorAll<HTMLElement>(
            "[data-directory-group-id]",
          ) ?? []),
        ].find((item) => item.dataset.directoryGroupId === position.groupId)
      : undefined;
    if (card && position)
      window.scrollTo(
        0,
        Math.max(
          0,
          window.scrollY + card.getBoundingClientRect().top - position.offset,
        ),
      );
    else {
      window.scrollTo(0, 0);
      if (position)
        controller.setNotice(
          "原群未出现在当前已加载结果中，可继续加载或调整搜索。",
        );
    }
  }, [controller, queryKey, state.initialized, state.items, state.position]);
  const refresh = () => {
    void controller.refresh();
  };
  return (
    <>
      {state.jobId && (
        <div className="panel job-panel">
          <button
            className="icon-button dismiss"
            aria-label="隐藏任务"
            onClick={() => controller.setJobId(null)}
          >
            ×
          </button>
          <JobProgress
            id={state.jobId}
            onComplete={() => {
              controller.invalidate();
            }}
          />
        </div>
      )}
      {attention.notice}
      {state.stale && !attention.pending && (
        <div className="notice warning" role="status">
          <div>
            <strong>列表有更新，刷新后继续加载。</strong>
            <span>当前保留已加载结果；刷新成功后从第一页重新浏览。</span>
          </div>
          <button
            className="button secondary small"
            disabled={busy || pendingQuery}
            onClick={refresh}
          >
            刷新
          </button>
        </div>
      )}
      {state.notice && (
        <div className="notice" role="status">
          {state.notice}
        </div>
      )}
      {state.error?.kind === "refresh" && (
        <div>
          <p className="warning-text">刷新失败，当前显示上次取得的结果。</p>
          <ErrorNotice error={state.error.value} retry={refresh} />
        </div>
      )}
      <div className="section-heading">
        <h2>{state.q ? "搜索结果" : "所有群组"}</h2>
        <span className="muted small" aria-live="polite">
          {pendingQuery
            ? "正在应用搜索条件…"
            : !state.initialized
              ? state.error && !busy
                ? "暂未取得群目录"
                : "正在读取群目录"
              : `已加载 ${state.items.length} 个群 · ${state.stale ? "列表待刷新" : state.nextCursor ? "还有更多" : "已全部加载"}`}
        </span>
      </div>
      {!state.initialized ? (
        state.error?.kind === "initial" && !busy ? (
          <section className="panel directory-empty">
            <h3>群列表加载失败</h3>
            <ErrorNotice error={state.error.value} retry={refresh} />
          </section>
        ) : (
          <Loading />
        )
      ) : !state.items.length ? (
        <section className="panel">
          <Empty title={state.q ? "没有匹配的群" : "从第一个群组开始"}>
            {state.q
              ? "试试名称、简介或完整群 ID，也可以清除搜索查看全部群。"
              : user?.role === "admin"
                ? "连接服务账号后，创建一个群组开始协作。"
                : "暂时没有群组，请等待管理员创建。"}
          </Empty>
          {state.q && (
            <div className="directory-empty-action">
              <button
                className="button secondary"
                onClick={() => controller.clearSearch()}
              >
                清除搜索
              </button>
            </div>
          )}
        </section>
      ) : (
        <div className="group-grid" ref={grid}>
          {state.items.map((group) => {
            const match = directoryMatch(group, state.q);
            return (
              <a
                key={group.id}
                {...attention.itemProps(group.id)}
                href={`#/groups/${encodeURIComponent(group.id)}`}
                className="group-card"
                data-directory-group-id={group.id}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  clickedPosition.current = {
                    groupId: group.id,
                    offset: event.currentTarget.getBoundingClientRect().top,
                    scrollY: window.scrollY,
                  };
                }}
              >
                <div className="split">
                  <span className="group-avatar">
                    <Icon name="chat" size={25} />
                  </span>
                  <Badge status={group.status} />
                </div>
                <h3>{group.name ?? group.gatewayGroupId}</h3>
                <span
                  className="mono muted small truncate"
                  title={group.gatewayGroupId}
                >
                  网关 ID · {group.gatewayGroupId}
                </span>
                {match.description && (
                  <p
                    className="directory-description"
                    title={group.description ?? undefined}
                  >
                    {match.description}
                  </p>
                )}
                {match.hint && (
                  <p className="directory-match small" title={match.hint}>
                    {match.hint}
                  </p>
                )}
                <div className="group-created muted small">
                  创建于 <DateTime value={group.createdAt} includeYear />
                </div>
                <div className="group-card-stats">
                  <span>
                    <Icon name="users" size={16} />
                    {group.memberCount} 位成员
                  </span>
                  <span
                    className={group.agentEnabled ? "success-text" : "muted"}
                  >
                    <span className="dot" />
                    Agent {group.agentEnabled ? "已开启" : "未开启"}
                  </span>
                </div>
                <div className="group-card-footer">
                  <span>
                    {group.activeAgentRunId
                      ? "Agent 正在运行"
                      : group.activeSequenceRunId
                        ? "定时序列运行中"
                        : "查看群组详情"}
                  </span>
                  <Icon name="arrow" size={18} />
                </div>
              </a>
            );
          })}
        </div>
      )}
      {state.error?.kind === "more" && (
        <div className="directory-page-error">
          <p className="warning-text">下一页加载失败，已加载的群仍保留。</p>
          <ErrorNotice
            error={state.error.value}
            retry={state.stale ? undefined : () => void controller.loadMore()}
          />
        </div>
      )}
      {state.initialized && state.nextCursor && (
        <div className="directory-load-more">
          <button
            className="button secondary"
            disabled={busy || state.stale || pendingQuery}
            onClick={() => void controller.loadMore()}
          >
            {state.loading === "more" ? "正在加载…" : "加载更多"}
          </button>
          <span className="muted small">每次最多加载 20 个群</span>
        </div>
      )}
      {createOpen && (
        <CreateGroup
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            controller.setJobId(id);
            setCreateOpen(false);
            controller.invalidate();
          }}
        />
      )}
    </>
  );
}
