import { useState } from "react";
import { patch, post } from "../api/client";
import {
  accountSchema,
  groupSchema,
  jobIdSchema,
  unknownSchema,
} from "../api/schemas";
import { useResource } from "../hooks/useResource";
import { useAuth } from "../state/auth";
import {
  Badge,
  Empty,
  ErrorNotice,
  Loading,
  Modal,
  PageHeader,
  label,
} from "../components/ui";
import { Timeline } from "../components/Timeline";
import { AgentRunList } from "../components/AgentRunList";
import { JobProgress } from "../components/JobProgress";
import { GroupProfile, EditGroupProfile } from "../components/GroupProfile";
const accountsSchema = accountSchema.array();
export function GroupDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const {
    data: group,
    loading,
    error,
    reload,
  } = useResource(`/api/groups/${encodeURIComponent(id)}`, groupSchema, 2_000);
  const accounts = useResource("/api/accounts", accountsSchema, 5_000);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const toggle = async (
    key: "agentEnabled" | "autoKickEnabled",
    value: boolean,
  ): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      await patch(`/api/groups/${encodeURIComponent(id)}`, unknownSchema, {
        [key]: value,
      });
      await reload();
    } catch (value) {
      setActionError(value);
    } finally {
      setBusy(false);
    }
  };
  const leave = async (): Promise<void> => {
    setBusy(true);
    setActionError(null);
    try {
      const result = await post(
        `/api/groups/${encodeURIComponent(id)}/leave-all`,
        jobIdSchema,
      );
      setJobId(result.jobId);
      setLeaveOpen(false);
    } catch (value) {
      setActionError(value);
    } finally {
      setBusy(false);
    }
  };
  if (loading && !group) return <Loading />;
  if (!group)
    return (
      <>
        <ErrorNotice error={error} retry={() => void reload()} />
        <Empty title="暂时无法打开群组">
          <a href="#/groups">返回群组列表</a>
        </Empty>
      </>
    );
  return (
    <>
      <a className="back-link" href="#/groups">
        ← 群组工作台
      </a>
      <PageHeader
        eyebrow="GROUP DETAILS"
        title={group.name ?? group.gatewayGroupId}
        subtitle={`网关群 ID · ${group.gatewayGroupId}`}
        actions={
          <>
            <Badge status={group.status} />
            <a
              className="button secondary"
              href={`#/sequences/${encodeURIComponent(id)}`}
            >
              定时序列
            </a>
          </>
        }
      />
      <ErrorNotice error={error ?? actionError} />
      {jobId && (
        <section className="panel">
          <JobProgress id={jobId} onComplete={() => void reload()} />
        </section>
      )}
      <div className="group-detail-layout">
        <div className="main-column">
          <Timeline key={id} group={group} accounts={accounts.data ?? []} />
          <AgentRunList groupId={id} />
        </div>
        <aside className="detail-aside">
          <GroupProfile
            group={group}
            canEdit={user?.role === "admin"}
            onEdit={() => setProfileOpen(true)}
          />
          <section className="panel">
            <div className="panel-header">
              <h2>自动化设置</h2>
            </div>
            <div className="settings">
              <Setting
                title="Agent 自动应答"
                description="接收外部成员消息并启动执行。"
                checked={group.agentEnabled}
                disabled={busy || group.status !== "active"}
                readOnly={user?.role !== "admin"}
                onChange={(value) => void toggle("agentEnabled", value)}
              />
              <Setting
                title="允许自动移除成员"
                description="需审计通过且执行账号具备权限。"
                checked={group.autoKickEnabled}
                disabled={busy || group.status !== "active"}
                readOnly={user?.role !== "admin"}
                onChange={(value) => void toggle("autoKickEnabled", value)}
              />
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>群成员</h2>
              <span className="count">{group.members.length}</span>
            </div>
            <div className="member-list">
              {group.members.length ? (
                group.members.map((member) => (
                  <div className="member" key={member.platformUserId}>
                    <span className="avatar">
                      {member.accountId ? member.accountId.slice(-2) : "外"}
                    </span>
                    <div>
                      <strong>{member.accountId ?? "外部成员"}</strong>
                      <span
                        className="mono muted small"
                        title={member.platformUserId}
                      >
                        {member.platformUserId}
                      </span>
                    </div>
                    <span className={`role role-${member.role}`}>
                      {label(member.role)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">当前无成员</p>
              )}
            </div>
          </section>
          {user?.role === "admin" && group.status !== "left" && (
            <section className="panel danger-zone">
              <h3>退出群组</h3>
              <p>
                服务账号依次退出，群主最后退出。任务结果会保留每个失败步骤。
              </p>
              <button
                className="button danger"
                onClick={() => setLeaveOpen(true)}
              >
                全部服务账号退群
              </button>
            </section>
          )}
        </aside>
      </div>
      {profileOpen && user?.role === "admin" && (
        <EditGroupProfile
          key={group.id}
          group={group}
          onClose={() => setProfileOpen(false)}
          onSaved={reload}
        />
      )}
      {leaveOpen && (
        <Modal title="确认全部服务账号退群" onClose={() => setLeaveOpen(false)}>
          <p>
            即将让此群的所有服务账号退出。非群主账号退群失败时会保留群主，便于后续处理。
          </p>
          <ErrorNotice error={actionError} />
          <div className="modal-footer">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setLeaveOpen(false)}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void leave()}
            >
              {busy ? "正在提交…" : "确认退群"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Setting({
  title,
  description,
  checked,
  disabled,
  readOnly,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  readOnly: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="setting">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {readOnly ? (
        <span className={checked ? "success-text" : "muted"}>
          {checked ? "已开启" : "未开启"}
        </span>
      ) : (
        <button
          type="button"
          role="switch"
          aria-label={title}
          aria-checked={checked}
          className={`switch ${checked ? "checked" : ""}`}
          disabled={disabled}
          onClick={() => onChange(!checked)}
        >
          <span />
        </button>
      )}
    </div>
  );
}
