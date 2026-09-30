import {
  useAttentionCollection,
  useManualMessageExclusion,
  type SnapshotEvidence,
} from "../attention";
import {
  definitiveSenderAvailabilityEvent,
  messageKey,
} from "../attention/pageAdapters";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { post } from "../api/client";
import { sentSchema, type Account, type Group } from "../api/schemas";
import { useTimeline } from "../hooks/useTimeline";
import { useAuth } from "../state/auth";
import { Badge, DateTime, Empty, ErrorNotice, Icon, Loading } from "./ui";
export function Timeline({
  group,
  accounts,
  accountsSnapshot,
  accountsError,
  reloadAccounts,
}: {
  group: Group;
  accounts: Account[];
  accountsSnapshot: SnapshotEvidence | null;
  accountsError: unknown;
  reloadAccounts: () => Promise<void>;
}) {
  const { user } = useAuth();
  const timeline = useTimeline(group.id);
  const ownSends = useManualMessageExclusion();
  const attention = useAttentionCollection({
    targetId: `messages:${group.id}`,
    label: "群消息有更新",
    eventKey: (event) =>
      ownSends.isExcluded(event) ? null : messageKey(event, group.id),
    // Delivery transitions update the existing row but never create new-content attention.
    versions: Object.fromEntries(
      timeline.items.map((message) => [
        message.id,
        JSON.stringify([message.id, message.text]),
      ]),
    ),
    evidence: timeline.snapshot,
    ready: !timeline.loading && !timeline.error,
    refresh: timeline.reconcile,
    renderSummary: (key) => {
      const message = timeline.items.find((item) => item.id === key);
      if (!message) return null;
      const excerpt = [...message.text].slice(0, 160).join("");
      return (
        <div>
          <strong>
            本条消息更新摘要 · {message.senderPlatformUserId ?? "服务账号"}
          </strong>
          <p>
            {excerpt}
            {[...message.text].length > 160 ? "…" : ""}
          </p>
          <span className="muted small">
            完整内容仍在时间线中，可滚动查看。
          </span>
        </div>
      );
    },
  });
  const [accountId, setAccountId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previousHeight = useRef<number | null>(null);
  const candidates = accounts.filter(
    (account) =>
      group.members.some((member) => member.accountId === account.id) &&
      ["online", "rate_limited"].includes(account.status),
  );
  const senders = useAttentionCollection({
    targetId: `senders:${group.id}`,
    label: "可用发送身份列表有更新",
    eventKey: (event) =>
      user?.role === "admin" &&
      ["account_status_changed", "account_terminal"].includes(event.type) &&
      group.members.some(
        (member) => member.accountId === event.payload.accountId,
      )
        ? "available-senders"
        : null,
    versions: {
      "available-senders": JSON.stringify(
        candidates
          .map((account) => [account.id, account.status])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ),
    },
    definitiveEvent: definitiveSenderAvailabilityEvent,
    evidence: accountsSnapshot,
    ready: accountsSnapshot !== null && !accountsError,
    refresh: reloadAccounts,
    rangeFallback: true,
    renderRangeSummary: () => (
      <div>
        <strong>当前可选发送身份：{candidates.length} 个</strong>
        {candidates.slice(0, 5).map((account) => (
          <p key={account.id}>
            {account.id} <Badge status={account.status} />
          </p>
        ))}
        {candidates.length > 5 && (
          <p>另有 {candidates.length - 5} 个，可在发送身份中查看。</p>
        )}
        {!candidates.length && <p>当前没有可用发送账号。</p>}
      </div>
    ),
  });
  const selected = candidates.some((account) => account.id === accountId)
    ? accountId
    : (candidates[0]?.id ?? "");
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (previousHeight.current !== null) {
      element.scrollTop += element.scrollHeight - previousHeight.current;
      previousHeight.current = null;
    } else if (nearBottom.current) element.scrollTop = element.scrollHeight;
  }, [timeline.items]);
  const send = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!text.trim() || !selected) return;
    const clientMsgId = crypto.randomUUID();
    ownSends.register(clientMsgId);
    setBusy(true);
    setError(null);
    try {
      await post(
        `/api/groups/${encodeURIComponent(group.id)}/send`,
        sentSchema,
        { accountId: selected, text, clientMsgId },
      );
      setText("");
      nearBottom.current = true;
      await timeline.reconcile();
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel timeline">
      <div className="panel-header">
        <h2>
          <Icon name="chat" size={18} />
          消息时间线
        </h2>
        <span className="muted small">
          {timeline.syncing
            ? "正在补齐消息…"
            : `${timeline.items.length} 条已加载`}
        </span>
      </div>
      {attention.notice}
      <ErrorNotice
        error={timeline.error}
        retry={() => void timeline.reconcile()}
      />
      <div
        className="timeline-scroll"
        ref={scroller}
        onScroll={(event) => {
          const target = event.currentTarget;
          nearBottom.current =
            target.scrollHeight - target.scrollTop - target.clientHeight < 80;
        }}
      >
        <div className="timeline-load">
          {timeline.cursor && (
            <button
              className="button small secondary"
              disabled={timeline.loadingEarlier}
              onClick={() => {
                previousHeight.current = scroller.current?.scrollHeight ?? null;
                void timeline.loadEarlier();
              }}
            >
              {timeline.loadingEarlier ? "正在加载…" : "加载更早"}
            </button>
          )}
        </div>
        {timeline.loading && !timeline.items.length ? (
          <Loading />
        ) : !timeline.items.length ? (
          <Empty title="消息会出现在这里">
            发送一条消息，或等待群成员的消息到达。
          </Empty>
        ) : (
          timeline.items.map((message) => (
            <article
              className={`message-row ${message.isOwn ? "own" : ""}`}
              key={message.id}
              data-message-id={message.id}
              {...attention.itemProps(message.id)}
            >
              <span className="message-avatar">
                {message.isOwn
                  ? "我"
                  : (message.senderPlatformUserId?.slice(-2) ?? "?")}
              </span>
              <div className="message-body">
                <div className="message-meta">
                  <strong>
                    {message.senderPlatformUserId ?? "待确认发送身份"}
                  </strong>
                  {message.isOwn && <span className="own-label">服务账号</span>}
                  <DateTime value={message.sentAt} />
                </div>
                <div className="message-bubble">{message.text}</div>
                <div className="message-status">
                  {message.isOwn && message.deliveryStatus && (
                    <Badge status={message.deliveryStatus} />
                  )}{" "}
                  {message.failCode && (
                    <code className="error-text">{message.failCode}</code>
                  )}
                  <span
                    className="message-id mono"
                    title={message.msgId ?? message.clientMsgId ?? message.id}
                  >
                    {message.msgId ?? message.clientMsgId}
                  </span>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      {user?.role === "admin" && (
        <form className="composer" onSubmit={(event) => void send(event)}>
          <ErrorNotice error={error ?? accountsError} />
          {senders.notice}
          {group.status !== "active" ? (
            <div className="notice warning">此群当前不可发送消息。</div>
          ) : (
            <>
              <textarea
                aria-label="消息内容"
                placeholder="输入要发送到群的消息…"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={2}
                maxLength={20_000}
              />
              <div className="split">
                <label className="inline-label">
                  发送身份
                  <select
                    aria-label="发送身份"
                    value={selected}
                    onChange={(event) => setAccountId(event.target.value)}
                    disabled={!candidates.length}
                  >
                    <option value="" disabled>
                      暂无可用账号
                    </option>
                    {candidates.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.id}
                        {account.status === "rate_limited"
                          ? "（限流中，将排队）"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary"
                  disabled={busy || !selected || !text.trim()}
                >
                  {busy ? "提交中…" : "发送消息"}
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </section>
  );
}
