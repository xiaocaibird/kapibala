import { useState } from "react";
import { post } from "../api/client";
import { accountSchema, unknownSchema, type Account } from "../api/schemas";
import { useResource } from "../hooks/useResource";
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
const accountsSchema = accountSchema.array();
interface AccountAction {
  text: string;
  to: "online" | "disconnected" | "idle";
  connect?: boolean;
}
export function legalActions(account: Account): AccountAction[] {
  switch (account.status) {
    case "idle":
      return [{ text: "连接账号", to: "online", connect: true }];
    case "disconnected":
      return [
        { text: "重连", to: "online", connect: true },
        { text: "释放账号", to: "idle" },
      ];
    case "online":
      return [
        { text: "断开连接", to: "disconnected" },
        { text: "释放账号", to: "idle" },
      ];
    case "rate_limited":
      return [{ text: "断开连接", to: "disconnected" }];
    default:
      return [];
  }
}
export function Accounts() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useResource(
    "/api/accounts",
    accountsSchema,
    5_000,
  );
  const [actionError, setActionError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);
  const act = async (
    account: Account,
    action: AccountAction,
  ): Promise<void> => {
    setPending(account.id);
    setActionError(null);
    try {
      await post(
        `/api/accounts/${encodeURIComponent(account.id)}/${action.connect ? "connect" : "transition"}`,
        unknownSchema,
        action.connect
          ? undefined
          : { to: action.to, expectedFrom: account.status },
      );
    } catch (value) {
      setActionError(value);
    } finally {
      await reload();
      setPending(null);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="SERVICE ACCOUNTS"
        title="服务账号"
        subtitle="查看账号状态与连接情况，统一管理发送身份。"
        actions={
          <button className="button secondary" onClick={() => void reload()}>
            <Icon name="refresh" size={16} />
            刷新
          </button>
        }
      />
      <div className="metric-grid">
        <Metric value={data?.length ?? "—"} label="全部账号" />
        <Metric
          value={data?.filter((item) => item.status === "online").length ?? "—"}
          label="在线可用"
          accent
        />
        <Metric
          value={
            data?.filter((item) => item.status === "rate_limited").length ?? "—"
          }
          label="等待限流恢复"
        />
        <Metric
          value={
            data?.filter((item) =>
              ["suspended", "session_expired"].includes(item.status),
            ).length ?? "—"
          }
          label="已进入终态"
        />
      </div>
      <ErrorNotice error={error} retry={() => void reload()} />
      <ErrorNotice error={actionError} />
      <section className="panel">
        <div className="panel-header">
          <h2>账号列表</h2>
          <span className="muted small">状态与平台实时同步</span>
        </div>
        {loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Empty title="暂无服务账号" icon="users">
            请完成数据库初始化后刷新。
          </Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>账号</th>
                <th>平台身份</th>
                <th>当前状态</th>
                <th>限流结束时间</th>
                {user?.role === "admin" && (
                  <th className="align-right">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((account) => (
                <tr key={account.id}>
                  <td>
                    <span className="identity">
                      <span className="avatar">
                        {account.id.slice(-2).toUpperCase()}
                      </span>
                      <strong>{account.id}</strong>
                    </span>
                  </td>
                  <td className="mono small">
                    {account.platformUserId ?? "尚未连接"}
                  </td>
                  <td>
                    <Badge status={account.status} />
                  </td>
                  <td>
                    <DateTime value={account.rateLimitedUntil} />
                  </td>
                  {user?.role === "admin" && (
                    <td className="align-right">
                      <div className="row-actions">
                        {legalActions(account).length ? (
                          legalActions(account).map((action) => (
                            <button
                              key={action.to}
                              className="button small ghost"
                              disabled={pending === account.id}
                              onClick={() => void act(account, action)}
                            >
                              {pending === account.id ? "处理中…" : action.text}
                            </button>
                          ))
                        ) : (
                          <span className="muted small">终态不可恢复</span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="footnote">
        断开连接会断开账号的网关连接；释放账号会断开连接并回到待连接，保留账号与历史记录。
        <br />
        限流结束后自动恢复；已停用与会话失效为终态。状态变更采用并发校验，冲突时刷新后重试。
      </p>
    </>
  );
}
function Metric({
  value,
  label,
  accent = false,
}: {
  value: number | string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
