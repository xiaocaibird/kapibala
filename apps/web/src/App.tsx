import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { AuthProvider, useAuth } from "./state/auth";
import { LiveProvider, useLive } from "./state/live";
import { GroupDirectoryProvider } from "./directory/GroupDirectoryProvider";
import { useRoute } from "./hooks/useRoute";
import { Login } from "./pages/Login";
import { Accounts } from "./pages/Accounts";
import { Groups } from "./pages/Groups";
import { GroupDetail } from "./pages/GroupDetail";
import { AgentRunDetail, AgentRuns } from "./pages/AgentRuns";
import { Sequences } from "./pages/Sequences";
import { ErrorNotice, Icon, Loading } from "./components/ui";
import { PageAttentionScope } from "./attention";
export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Session />
      </AuthProvider>
    </ErrorBoundary>
  );
}
function Session() {
  const { user, restoring } = useAuth();
  if (restoring)
    return (
      <div className="boot">
        <span className="brand-mark">K</span>
        <Loading text="正在恢复会话…" />
      </div>
    );
  return user ? (
    <LiveProvider key={`${user.username}:${user.role}`}>
      <GroupDirectoryProvider>
        <Workspace />
      </GroupDirectoryProvider>
    </LiveProvider>
  ) : (
    <Login />
  );
}
function Workspace() {
  const route = useRoute();
  const { user, logout } = useAuth();
  const { connection, notices, dismiss } = useLive();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const signOut = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await logout();
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  };
  const navigation = [
    { path: "groups", label: "群组工作台", icon: "chat" as const },
    { path: "accounts", label: "服务账号", icon: "users" as const },
    { path: "agent-runs", label: "Agent 运行", icon: "activity" as const },
    { path: "sequences", label: "定时序列", icon: "sequence" as const },
  ];
  const workspacePage =
    route.page === "agent-runs" && route.id && route.agentOrigin === "groups"
      ? "groups"
      : route.page;
  const currentName =
    navigation.find((item) => item.path === workspacePage)?.label ??
    "群组工作台";
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="#/groups">
          <span className="brand-mark">K</span>kapibala
          <span className="brand-dot">.</span>
        </a>
        <span className="sidebar-label">工作空间</span>
        <nav>
          {navigation.map((item) => (
            <a
              key={item.path}
              href={`#/${item.path}`}
              className={workspacePage === item.path ? "active" : ""}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {workspacePage === item.path && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-card">
            <span className="workspace-icon">
              <Icon name="grid" size={17} />
            </span>
            <div>
              <strong>消息运营平台</strong>
              <span>本地工作空间</span>
            </div>
          </div>
          <div className="user-card">
            <span className="user-avatar">
              {user?.username.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user?.username}</strong>
              <span>{user?.role === "admin" ? "管理员" : "只读访问"}</span>
            </div>
            <button
              className="icon-button"
              onClick={() => void signOut()}
              disabled={busy}
              aria-label="退出登录"
              title="退出登录"
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <div className="topbar">
          <div className="breadcrumbs">
            工作空间 <span>/</span> <strong>{currentName}</strong>
          </div>
          <div className="topbar-meta">
            {user?.role === "viewer" && (
              <span className="readonly-tag">只读模式</span>
            )}
            <span className={`connection ${connection}`} role="status">
              <span className="dot" />
              {connection === "live"
                ? "实时同步中"
                : connection === "connecting"
                  ? "连接中"
                  : "连接恢复中"}
            </span>
          </div>
        </div>
        <main className="content">
          <ErrorNotice error={error} />
          {connection === "reconnecting" && (
            <div className="notice warning">
              实时连接已断开，正在自动重连并补齐期间的变化。
            </div>
          )}
          {notices.length > 0 && (
            <div className="live-notices" aria-live="polite">
              {notices.map((notice) => (
                <div className="notice warning" key={notice.seq}>
                  <Icon name="alert" size={18} />
                  <div>
                    <strong>
                      {notice.type === "inconsistency"
                        ? "数据一致性提醒"
                        : notice.type === "account_terminal"
                          ? "账号已进入终态"
                          : "Agent 审计阻塞"}
                    </strong>
                    <span>
                      {String(
                        notice.payload.message ??
                          notice.payload.accountId ??
                          notice.payload.runId ??
                          "",
                      )}
                    </span>
                    {typeof notice.payload.runId === "string" && (
                      <a
                        href={`#/agent-runs/${encodeURIComponent(notice.payload.runId)}`}
                      >
                        查看运行详情 →
                      </a>
                    )}
                  </div>
                  <button
                    className="icon-button"
                    aria-label="关闭提醒"
                    onClick={() => dismiss(notice.seq)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {route.page === "accounts" ? (
            <PageAttentionScope
              scopeKey="accounts"
              title="服务账号 · Kapibala"
              acceptEvent={(event) =>
                [
                  "account_changed",
                  "account_status_changed",
                  "account_terminal",
                ].includes(event.type)
              }
            >
              <Accounts />
            </PageAttentionScope>
          ) : route.page === "agent-runs" ? (
            route.id ? (
              <PageAttentionScope
                key={route.id}
                scopeKey={`agent-run:${route.id}`}
                acceptEvent={(event) =>
                  event.payload.runId === route.id &&
                  ["agent_run", "agent_step_changed"].includes(event.type)
                }
                title={
                  route.agentOrigin === "groups"
                    ? "群组工作台 · Agent 运行详情 · Kapibala"
                    : "Agent 运行详情 · Kapibala"
                }
              >
                <AgentRunDetail
                  id={route.id}
                  origin={route.agentOrigin}
                  sourceGroup={route.agentGroup}
                />
              </PageAttentionScope>
            ) : (
              <AgentRuns selectedGroup={route.agentGroup} />
            )
          ) : route.page === "sequences" ? (
            <Sequences key={route.id ?? "all"} groupId={route.id} />
          ) : route.id && route.page === "groups" ? (
            <PageAttentionScope
              key={route.id}
              scopeKey={`group:${route.id}`}
              acceptEvent={(event) =>
                event.payload.groupId === route.id ||
                [
                  "job_changed",
                  "account_changed",
                  "account_status_changed",
                  "account_terminal",
                ].includes(event.type)
              }
              title="群详情 · Kapibala"
            >
              <GroupDetail id={route.id} />
            </PageAttentionScope>
          ) : (
            <Groups />
          )}
          <footer className="page-footer">
            <span>Kapibala Console</span>
            <span>状态有记录，执行可追踪。</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("控制台渲染失败", error, info.componentStack);
  }
  render() {
    return this.state.error ? (
      <div className="boot">
        <h1>页面暂时无法显示</h1>
        <p>刷新后会从服务恢复最新状态。</p>
        <button className="button primary" onClick={() => location.reload()}>
          重新加载
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
