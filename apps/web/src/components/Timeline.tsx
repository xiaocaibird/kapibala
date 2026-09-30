import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { post } from "../api/client";
import { sentSchema, type Account, type Group } from "../api/schemas";
import { useTimeline } from "../hooks/useTimeline";
import { useAuth } from "../state/auth";
import { Badge, DateTime, Empty, ErrorNotice, Icon, Loading } from "./ui";
export function Timeline({
  group,
  accounts,
}: {
  group: Group;
  accounts: Account[];
}) {
  const { user } = useAuth();
  const timeline = useTimeline(group.id);
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
    setBusy(true);
    setError(null);
    try {
      await post(
        `/api/groups/${encodeURIComponent(group.id)}/send`,
        sentSchema,
        { accountId: selected, text },
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
          <ErrorNotice error={error} />
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
