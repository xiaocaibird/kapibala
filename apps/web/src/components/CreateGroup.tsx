import { useState, type FormEvent } from "react";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
} from "../../../../packages/contracts/src/index";
import { post } from "../api/client";
import { createGroupProfile } from "../api/groupProfile";
import { accountSchema, jobIdSchema } from "../api/schemas";
import { useResource } from "../hooks/useResource";
import { useGroupFormGuard } from "../hooks/useGroupFormGuard";
import { GroupDiscardPrompt } from "./GroupDiscardPrompt";
import { ErrorNotice, Loading, Modal } from "./ui";
const accountsSchema = accountSchema.array();
export function CreateGroup({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (jobId: string) => void;
}) {
  const { data, loading, error } = useResource("/api/accounts", accountsSchema);
  const [creator, setCreator] = useState("");
  const [admin, setAdmin] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const guard = useGroupFormGuard(
    Boolean(creator || admin || members.length || name || description),
    onClose,
  );
  const { busy } = guard;
  const online = data?.filter((account) => account.status === "online") ?? [];
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await guard.submit(async (isCurrent) => {
      const { jobId } = await post("/api/groups", jobIdSchema, {
        ...createGroupProfile({ name, description }),
        creatorAccountId: creator,
        memberAccountIds: [
          admin,
          ...members.filter((id) => id !== creator && id !== admin),
        ],
      });
      if (isCurrent()) onCreated(jobId);
    });
  };
  return (
    <Modal title="创建群组" onClose={guard.close}>
      <form onSubmit={(event) => void submit(event)}>
        <p className="muted">
          选择在线账号。管理员会在入群确认后自动提升权限。
        </p>
        <ErrorNotice error={error ?? guard.error} />
        {loading ? (
          <Loading />
        ) : (
          <>
            <label>
              群名称 <span className="muted small">可选</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
                placeholder="例如：产品协作群"
                aria-describedby="create-group-name-help"
              />
              <span className="muted small" id="create-group-name-help">
                留空时显示网关群 ID；填写后去除首尾空格，最多{" "}
                {GROUP_NAME_MAX_LENGTH} 个字符。
              </span>
            </label>
            <label>
              群简介 <span className="muted small">可选</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={busy}
                rows={3}
                placeholder="介绍这个群的用途与协作安排"
                aria-describedby="create-group-description-help"
              />
              <span className="muted small" id="create-group-description-help">
                最多 {GROUP_DESCRIPTION_MAX_LENGTH} 个字符，可稍后编辑。
              </span>
            </label>
            <label>
              群主账号
              <select
                value={creator}
                onChange={(event) => {
                  setCreator(event.target.value);
                  if (admin === event.target.value) setAdmin("");
                }}
                required
                disabled={busy}
              >
                <option value="">请选择群主</option>
                {online.map((account) => (
                  <option key={account.id}>{account.id}</option>
                ))}
              </select>
            </label>
            <label>
              管理员账号
              <select
                value={admin}
                onChange={(event) => setAdmin(event.target.value)}
                required
                disabled={busy}
              >
                <option value="">请选择管理员</option>
                {online
                  .filter((account) => account.id !== creator)
                  .map((account) => (
                    <option key={account.id}>{account.id}</option>
                  ))}
              </select>
            </label>
            <fieldset>
              <legend>
                其他成员 <span className="muted">可选</span>
              </legend>
              {online
                .filter(
                  (account) => account.id !== creator && account.id !== admin,
                )
                .map((account) => (
                  <label className="checkbox-label" key={account.id}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={members.includes(account.id)}
                      onChange={(event) =>
                        setMembers((values) =>
                          event.target.checked
                            ? [...values, account.id]
                            : values.filter((value) => value !== account.id),
                        )
                      }
                    />
                    {account.id}
                  </label>
                ))}
              {online.length < 2 && (
                <p className="warning-text">
                  至少需要两个在线账号，请先在服务账号页连接。
                </p>
              )}
            </fieldset>
          </>
        )}
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={guard.close}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="button primary"
            disabled={busy || !creator || !admin || creator === admin}
          >
            {busy ? "正在提交…" : "创建群组"}
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
