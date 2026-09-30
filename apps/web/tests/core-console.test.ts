import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Account, Group } from "../src/api/schemas";
import {
  availableSenders,
  resolveSenderSelection,
} from "../src/components/senderSelection";
import { SequenceStepTime } from "../src/components/SequenceStepTime";

const accounts: Account[] = ["account-1", "account-2"].map((id) => ({
  id,
  status: "online",
  platformUserId: `platform-${id}`,
  rateLimitedUntil: null,
}));
const members: Group["members"] = accounts.map((account) => ({
  accountId: account.id,
  platformUserId: account.platformUserId!,
  role: "member",
}));

test("an unavailable selected sender stays selected until the user explicitly chooses another identity", () => {
  for (const status of ["offline", "suspended", "session_expired"] as const) {
    const changed = accounts.map((account) =>
      account.id === "account-2" ? { ...account, status } : account,
    );
    const candidates = availableSenders(changed, members);
    assert.equal(
      resolveSenderSelection("account-2", candidates),
      "account-2",
      status,
    );
    assert.equal(
      candidates.some((account) => account.id === "account-2"),
      false,
    );
  }
  const remaining = availableSenders(accounts, members.slice(0, 1));
  assert.equal(resolveSenderSelection("account-2", remaining), "account-2");
  assert.equal(resolveSenderSelection("account-1", remaining), "account-1");
});

test("initial default and rate limited sender keep the existing queue policy", () => {
  assert.equal(resolveSenderSelection("", []), "");
  assert.equal(resolveSenderSelection("", accounts), "account-1");
  const limited = availableSenders(
    accounts.map((account) => ({ ...account, status: "rate_limited" })),
    members,
  );
  assert.equal(resolveSenderSelection("account-2", limited), "account-2");
  assert.equal(limited.length, 2);
});

test("sequence timestamps distinguish confirmed delivery, skipped handling and failed handling", () => {
  const sentAt = "2026-10-01T01:00:00.000Z";
  for (const [status, label] of [
    ["failed", "失败处理时间"],
    ["sent", "确认发出时间"],
    ["skipped", "跳过时间"],
  ] as const) {
    const markup = renderToStaticMarkup(
      createElement(SequenceStepTime, { step: { status, sentAt } }),
    );
    assert.match(markup, new RegExp(label), status);
    assert.match(markup, /dateTime="2026-10-01T01:00:00.000Z"/);
    if (status !== "sent") assert.doesNotMatch(markup, /实际发出|确认发出/);
  }
  for (const status of ["pending", "accepted"] as const) {
    const markup = renderToStaticMarkup(
      createElement(SequenceStepTime, { step: { status, sentAt } }),
    );
    assert.match(markup, /尚无确认发出时间/);
    assert.doesNotMatch(markup, /<time/);
  }
});
