import { Modal } from "./ui";

export function GroupDiscardPrompt({
  onContinue,
  onDiscard,
}: {
  onContinue: () => void;
  onDiscard: () => void;
}) {
  return (
    <Modal title="放弃未保存的修改？" onClose={onContinue}>
      <p>关闭后，本次尚未提交的内容不会保存。</p>
      <div className="modal-footer">
        <button
          className="button secondary"
          type="button"
          onClick={onContinue}
          autoFocus
        >
          继续编辑
        </button>
        <button className="button danger" type="button" onClick={onDiscard}>
          放弃修改
        </button>
      </div>
    </Modal>
  );
}
