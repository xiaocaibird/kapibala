import React, { useState, type FormEvent } from "react";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
} from "../../../../packages/contracts/src/index";
import { patch } from "../api/client";
import {
  changedProfileFields,
  conditionalGroupProfilePatch,
  readGroupProfileConflict,
  rebaseGroupProfileDraft,
  type GroupProfileConflict,
  type GroupProfileDraft,
  type GroupProfileField,
} from "../api/groupProfile";
import { groupSchema, type Group } from "../api/schemas";
import { DateTime, ErrorNotice, Modal } from "./ui";
import { useGroupFormGuard } from "../hooks/useGroupFormGuard";
import { GroupDiscardPrompt } from "./GroupDiscardPrompt";

interface ProfileConflictView extends GroupProfileConflict {
  submittedFields: GroupProfileField[];
}
const profileLabels: Record<GroupProfileField, string> = {
  name: "群名称",
  description: "群简介",
};

export function GroupProfile({
  group,
  canEdit,
  onEdit,
}: {
  group: Group;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>群资料</h2>
        {canEdit && (
          <button className="button small secondary" onClick={onEdit}>
            编辑资料
          </button>
        )}
      </div>
      <dl className="group-profile">
        <div>
          <dt>群简介</dt>
          <dd className={group.description ? "group-description" : "muted"}>
            {group.description ?? "未填写"}
          </dd>
        </div>
        <div>
          <dt>创建时间</dt>
          <dd>
            <DateTime value={group.createdAt} includeYear />
          </dd>
        </div>
        <div>
          <dt>平台群 ID</dt>
          <dd className="mono small">{group.id}</dd>
        </div>
      </dl>
    </section>
  );
}

export function EditGroupProfile({
  group,
  onClose,
  onSaved,
}: {
  group: Group;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [original, setOriginal] = useState(() => ({
    name: group.name,
    description: group.description,
  }));
  const [draft, setDraft] = useState<GroupProfileDraft>(() => ({
    name: group.name ?? "",
    description: group.description ?? "",
  }));
  const [conflict, setConflict] = useState<ProfileConflictView | null>(null);
  const hasChanges =
    draft.name !== (original.name ?? "") ||
    draft.description !== (original.description ?? "");
  const guard = useGroupFormGuard(hasChanges, onClose);
  const { busy } = guard;
  let canAdoptLatest = false;
  if (conflict) {
    try {
      canAdoptLatest = conditionalGroupProfilePatch(original, draft) === null;
    } catch {
      // Invalid draft input stays editable and is reported on explicit submit.
    }
  }
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await guard.submit(async (isCurrent) => {
      const changes = conditionalGroupProfilePatch(original, draft);
      if (changes) {
        try {
          await patch(
            `/api/groups/${encodeURIComponent(group.id)}`,
            groupSchema,
            changes,
          );
        } catch (error) {
          if (isCurrent()) {
            const latest = readGroupProfileConflict(error);
            if (latest) {
              const submittedFields = changedProfileFields(changes);
              setOriginal(latest.current);
              setDraft(
                rebaseGroupProfileDraft(draft, latest.current, submittedFields),
              );
              setConflict({ ...latest, submittedFields });
            }
          }
          // Resolving this action would make the form guard mark it closed.
          // Keep the form and draft available for an explicit second decision.
          throw error;
        }
        if (!isCurrent()) return;
        await onSaved();
      } else if (conflict && isCurrent()) {
        await onSaved();
      }
      if (isCurrent()) onClose();
    });
  };
  return (
    <Modal title="编辑群资料" onClose={guard.close}>
      <form onSubmit={(event) => void submit(event)}>
        <p className="muted">
          名称便于辨识群组，简介帮助成员了解用途。仅保存本次修改的资料。
        </p>
        <ErrorNotice error={guard.error} />
        {conflict && (
          <GroupProfileConflictNotice conflict={conflict} draft={draft} />
        )}
        <label>
          群名称
          <input
            value={draft.name}
            disabled={busy}
            onChange={(event) =>
              setDraft((value) => ({ ...value, name: event.target.value }))
            }
            placeholder={group.gatewayGroupId}
            aria-describedby="edit-group-name-help"
          />
          <span className="muted small" id="edit-group-name-help">
            去除首尾空格后 1–{GROUP_NAME_MAX_LENGTH}{" "}
            个字符；已填写的名称不能清空。
          </span>
        </label>
        <label>
          群简介
          <textarea
            value={draft.description}
            disabled={busy}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                description: event.target.value,
              }))
            }
            rows={4}
            placeholder="介绍这个群的用途与协作安排"
            aria-describedby="edit-group-description-help"
          />
          <span className="muted small" id="edit-group-description-help">
            最多 {GROUP_DESCRIPTION_MAX_LENGTH} 个字符，留空可清除已有简介。
          </span>
        </label>
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={guard.close}
          >
            取消
          </button>
          <button
            className="button primary"
            disabled={busy || (!hasChanges && !conflict)}
          >
            {busy
              ? "正在保存…"
              : conflict
                ? canAdoptLatest
                  ? "采用最新内容"
                  : "确认修改并保存"
                : "保存资料"}
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

export function GroupProfileConflictNotice({
  conflict,
  draft,
}: {
  conflict: ProfileConflictView;
  draft: GroupProfileDraft;
}) {
  return (
    <section
      className="notice warning"
      role="alert"
      aria-label="群资料保存冲突"
    >
      <div>
        <strong>群资料已发生变化，本次修改尚未保存。</strong>
        <span>
          以下为本次提交的全部字段；未标注冲突的字段也未保存。请核对服务器资料与草稿，继续编辑后确认保存；再次保存仍会检查是否有新变化。
        </span>
        <dl className="group-profile">
          {conflict.submittedFields.map((field) => (
            <div key={field}>
              <dt>
                {profileLabels[field]}
                {conflict.conflictingFields.includes(field)
                  ? " · 发生冲突"
                  : " · 本次未保存"}
              </dt>
              <dd>
                <span className="muted small">服务器资料（本次冲突时）</span>
                <p className="group-description">
                  {conflict.current[field] === null
                    ? "未填写"
                    : conflict.current[field] === ""
                      ? "（空字符串）"
                      : conflict.current[field]}
                </p>
                <span className="muted small">
                  您的草稿（可在下方继续编辑）
                </span>
                <p className="group-description">
                  {draft[field].trim() === ""
                    ? field === "description"
                      ? "清空简介"
                      : "（空，名称不可清空）"
                    : draft[field]}
                </p>
              </dd>
            </div>
          ))}
        </dl>
        <span>
          未修改的字段已同步为本次取得的服务器资料；若草稿已与服务器一致，可采用最新内容，不再发送修改请求。
        </span>
      </div>
    </section>
  );
}
