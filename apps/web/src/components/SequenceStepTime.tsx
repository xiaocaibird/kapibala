import React from "react";
import type { SequenceRunStep } from "../../../../packages/contracts/src/index";
import { DateTime } from "./ui";

export function SequenceStepTime({
  step,
}: {
  step: Pick<SequenceRunStep, "status" | "sentAt">;
}) {
  const label =
    step.status === "sent"
      ? "确认发出时间"
      : step.status === "skipped"
        ? "跳过时间"
        : step.status === "failed"
          ? "失败处理时间"
          : null;
  return (
    <span>
      {label ? (
        <>
          {label} <DateTime value={step.sentAt} />
        </>
      ) : (
        "尚无确认发出时间"
      )}
    </span>
  );
}
