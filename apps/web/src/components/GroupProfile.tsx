import React, { useState, type FormEvent } from "react";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
} from "../../../../packages/contracts/src/index";
import { patch } from "../api/client";
import {
  changedGroupProfile,
  type GroupProfileDraft,
} from "../api/groupProfile";
import { groupSchema, type Group } from "../api/schemas";
import { DateTime, ErrorNotice, Modal } from "./ui";

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
  const [original] = useState(() => ({
    name: group.name,
    description: group.description,
  }));
  const [draft, setDraft] = useState<GroupProfileDraft>(() => ({
    name: group.name ?? "",
    description: group.description ?? "",
  }));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const hasChanges =
    draft.name !== (original.name ?? "") ||
    draft.description !== (original.description ?? "");
  const close = () => {
    if (!busy) onClose();
  };
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const changes = changedGroupProfile(original, draft);
      if (Object.keys(changes).length) {
        await patch(
          `/api/groups/${encodeURIComponent(group.id)}`,
          groupSchema,
          changes,
        );
        await onSaved();
      }
      onClose();
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="编辑群资料" onClose={close}>
      <form onSubmit={(event) => void submit(event)}>
        <p className="muted">
          名称便于辨识群组，简介帮助成员了解用途。仅保存本次修改的资料。
        </p>
        <ErrorNotice error={error} />
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
            onClick={close}
          >
            取消
          </button>
          <button className="button primary" disabled={busy || !hasChanges}>
            {busy ? "正在保存…" : "保存资料"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
