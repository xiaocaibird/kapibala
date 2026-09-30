import React, { useEffect, useRef, type ReactNode } from "react";
import { ApiError, describeError } from "../api/client";
export function Icon({
  name,
  size = 20,
}: {
  name:
    | "grid"
    | "users"
    | "chat"
    | "activity"
    | "sequence"
    | "arrow"
    | "plus"
    | "logout"
    | "refresh"
    | "check"
    | "alert";
  size?: number;
}) {
  const paths: Record<typeof name, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75" />
        <circle cx="9" cy="7" r="4" />
      </>
    ),
    chat: (
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
    ),
    activity: (
      <>
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </>
    ),
    sequence: (
      <>
        <circle cx="5" cy="5" r="2" />
        <circle cx="19" cy="12" r="2" />
        <circle cx="5" cy="19" r="2" />
        <path d="M7 5h7a5 5 0 0 1 0 10H9a4 4 0 0 0-4 2" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    plus: <path d="M12 5v14m-7-7h14" />,
    logout: (
      <>
        <path d="M9 5H5v14h4m5-14 7 7-7 7m-5-7h12" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5m-4-4a8 8 0 0 1 13-4l2 3M4 17l2 3a8 8 0 0 0 13-4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    alert: (
      <>
        <path d="m12 3 10 18H2L12 3zM12 9v4m0 4h.01" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
const labels: Record<string, string> = {
  idle: "待连接",
  online: "在线",
  rate_limited: "限流中",
  disconnected: "已离线",
  suspended: "已停用",
  session_expired: "会话失效",
  active: "可用",
  unreachable: "不可写",
  left: "已退出",
  running: "运行中",
  finished: "已完成",
  failed: "失败",
  blocked: "审计阻塞",
  cancelled: "已取消",
  stopped: "已停止",
  queued: "排队中",
  accepted: "已受理",
  sent: "已发送",
  unknown: "待确认",
  pending: "待执行",
  skipped: "已跳过",
  creator: "群主",
  admin: "管理员",
  member: "成员",
  pass: "通过",
  fail: "拒绝",
  tool_use: "工具调用",
  final: "结束",
  protocol_error: "协议错误",
  default: "默认变量",
};
export function label(value: string): string {
  return labels[value] ?? value;
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" />
      {label(status)}
    </span>
  );
}
export function Empty({
  title,
  children,
  icon = "chat",
}: {
  title: string;
  children?: ReactNode;
  icon?: Parameters<typeof Icon>[0]["name"];
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={26} />
      </div>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      <Icon name="alert" />
      <div>
        <strong>{describeError(error)}</strong>
        {error instanceof ApiError && (
          <>
            <span className="mono small">
              {error.code}
              {error.requestId ? ` · 请求 ${error.requestId}` : ""}
            </span>
            {typeof error.details.stepIndex === "number" && (
              <span>
                第 {error.details.stepIndex} 步缺少变量：
                <code>{String(error.details.key)}</code>
              </span>
            )}
          </>
        )}
      </div>
      {retry && (
        <button className="button small secondary" onClick={retry}>
          重试
        </button>
      )}
    </div>
  );
}
export function Loading({ text = "正在读取数据…" }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {text}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="关闭弹窗">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function DateTime({
  value,
  includeYear = false,
}: {
  value: string | null;
  includeYear?: boolean;
}) {
  if (!value) return <span className="muted">—</span>;
  const date = new Date(value);
  return (
    <time dateTime={value} title={value}>
      {Number.isNaN(date.getTime())
        ? value
        : date.toLocaleString("zh-CN", {
            hour12: false,
            year: includeYear ? "numeric" : undefined,
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
    </time>
  );
}
export function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="json-view">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}
