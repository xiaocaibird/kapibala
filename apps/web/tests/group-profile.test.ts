import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
} from "../../../packages/contracts/src/index";
import {
  changedGroupProfile,
  changedProfileFields,
  conditionalGroupProfilePatch,
  createGroupProfile,
  groupOptionLabel,
  readGroupProfileConflict,
  rebaseGroupProfileDraft,
} from "../src/api/groupProfile";
import { ApiError } from "../src/api/client";
import { groupSchema, type Group } from "../src/api/schemas";
import {
  GroupProfile,
  GroupProfileConflictNotice,
} from "../src/components/GroupProfile";

const group: Group = {
  id: "local-group",
  gatewayGroupId: "gateway-group",
  name: null,
  description: null,
  createdAt: "2026-09-30T11:00:00.000Z",
  status: "active",
  creatorAccountId: "account-1",
  agentEnabled: false,
  autoKickEnabled: false,
  members: [],
  activeSequenceRunId: null,
  activeAgentRunId: null,
};

test("creating a group omits untouched metadata but rejects an explicitly blank name", () => {
  assert.deepEqual(createGroupProfile({ name: "", description: " \n " }), {});
  assert.deepEqual(
    createGroupProfile({ name: "  协作群  ", description: " \n 发布安排 \n " }),
    {
      name: "协作群",
      description: "发布安排",
    },
  );
  assert.throws(
    () => createGroupProfile({ name: " \t ", description: "" }),
    /群名称/,
  );
});

test("metadata limits apply after trimming and reject excess input instead of truncating it", () => {
  const name = "群".repeat(GROUP_NAME_MAX_LENGTH);
  const description = "介".repeat(GROUP_DESCRIPTION_MAX_LENGTH);
  assert.deepEqual(
    createGroupProfile({ name: ` ${name} `, description: ` ${description} ` }),
    { name, description },
  );
  assert.throws(
    () => createGroupProfile({ name: name + "多", description: "" }),
    /群名称/,
  );
  assert.throws(
    () => createGroupProfile({ name: "", description: description + "多" }),
    /群简介/,
  );
});

test("profile patches preserve concurrently updated fields the user did not edit", () => {
  const opened = { name: "原名称", description: "原简介" };
  const current = { name: "其他管理员的新名称", description: "原简介" };
  const changes = changedGroupProfile(opened, {
    name: "原名称",
    description: "新简介",
  });
  assert.deepEqual(changes, { description: "新简介" });
  assert.deepEqual(
    { ...current, ...changes },
    { name: "其他管理员的新名称", description: "新简介" },
  );
  assert.deepEqual(
    changedGroupProfile(opened, { name: "  原名称  ", description: "原简介" }),
    {},
  );
  assert.deepEqual(
    changedGroupProfile(
      { name: null, description: null },
      { name: "", description: "单独增加简介" },
    ),
    { description: "单独增加简介" },
  );
});

test("an existing description can be cleared without clearing a group name", () => {
  const opened = { name: "保留名称", description: "将被清空" };
  assert.deepEqual(
    changedGroupProfile(opened, { name: "保留名称", description: " \n " }),
    { description: "" },
  );
  assert.throws(
    () => changedGroupProfile(opened, { name: "", description: "将被清空" }),
    /不能清空/,
  );
  assert.throws(
    () =>
      changedGroupProfile(opened, { name: " \n ", description: "将被清空" }),
    /不能清空/,
  );
});

test("conditional profile writes include raw expected values only for semantically changed fields", () => {
  const original = { name: " 原始名称 ", description: null };
  assert.deepEqual(
    conditionalGroupProfilePatch(original, {
      name: "  新名称  ",
      description: "",
    }),
    {
      name: "新名称",
      expected: { name: " 原始名称 " },
    },
  );
  for (const description of [null, ""])
    assert.deepEqual(
      conditionalGroupProfilePatch(
        { name: null, description },
        { name: "", description: " 新简介 " },
      ),
      {
        description: "新简介",
        expected: { description },
      },
    );
  assert.deepEqual(
    conditionalGroupProfilePatch(
      { name: null, description: "原简介" },
      { name: "新名称", description: "  " },
    ),
    {
      name: "新名称",
      description: "",
      expected: { name: null, description: "原简介" },
    },
  );
  assert.equal(
    conditionalGroupProfilePatch(
      { name: "名称", description: null },
      { name: " 名称 ", description: " \n " },
    ),
    null,
  );
});

test("profile conflict parsing requires the exact 409 contract and does not normalize server values", () => {
  const details = {
    current: { name: " legacy value ", description: "" },
    conflictingFields: ["name"],
  };
  assert.deepEqual(
    readGroupProfileConflict(
      new ApiError(
        "GROUP_PROFILE_CONFLICT",
        "conflict",
        409,
        "request",
        details,
      ),
    ),
    details,
  );
  assert.equal(
    readGroupProfileConflict(
      new ApiError("OTHER_CONFLICT", "other", 409, null, details),
    ),
    null,
  );
  assert.equal(
    readGroupProfileConflict(
      new ApiError("GROUP_PROFILE_CONFLICT", "other", 400, null, details),
    ),
    null,
  );
  assert.equal(
    readGroupProfileConflict({
      code: "GROUP_PROFILE_CONFLICT",
      status: 409,
      details,
    }),
    null,
  );
  for (const malformed of [
    {},
    { current: { name: "name" }, conflictingFields: ["name"] },
    { current: { name: 1, description: null }, conflictingFields: ["name"] },
    {
      current: { name: null, description: null },
      conflictingFields: ["status"],
    },
    { current: { name: null, description: null }, conflictingFields: [] },
    {
      current: { name: null, description: null },
      conflictingFields: ["name", "name"],
    },
  ])
    assert.equal(
      readGroupProfileConflict(
        new ApiError(
          "GROUP_PROFILE_CONFLICT",
          "bad response",
          409,
          null,
          malformed,
        ),
      ),
      null,
    );
});

test("a name conflict rebases untouched description without losing the raw submitted draft", () => {
  const opened = Object.freeze({ name: "原名称", description: "原简介" });
  const draft = Object.freeze({
    name: "  我的新名称  ",
    description: "原简介",
  });
  const submitted = conditionalGroupProfilePatch(opened, draft)!;
  const current = Object.freeze({
    name: "其他人的名称",
    description: "其他人的新简介",
  });
  const rebased = rebaseGroupProfileDraft(
    draft,
    current,
    changedProfileFields(submitted),
  );
  assert.deepEqual(rebased, {
    name: "  我的新名称  ",
    description: "其他人的新简介",
  });
  assert.deepEqual(conditionalGroupProfilePatch(current, rebased), {
    name: "我的新名称",
    expected: { name: "其他人的名称" },
  });
  assert.deepEqual(opened, { name: "原名称", description: "原简介" });
  assert.deepEqual(draft, { name: "  我的新名称  ", description: "原简介" });
});

test("normalization-only untouched input follows the new snapshot instead of becoming a stale write", () => {
  const opened = { name: "原名称", description: "原简介" };
  const draft = { name: "新名称", description: " \n 原简介 \n " };
  const submitted = conditionalGroupProfilePatch(opened, draft)!;
  assert.deepEqual(changedProfileFields(submitted), ["name"]);
  const current = { name: "竞争名称", description: "新版简介" };
  const rebased = rebaseGroupProfileDraft(
    draft,
    current,
    changedProfileFields(submitted),
  );
  assert.equal(rebased.description, "新版简介");
  assert.deepEqual(conditionalGroupProfilePatch(current, rebased), {
    name: "新名称",
    expected: { name: "竞争名称" },
  });
});

test("multi-field conflict keeps every submitted draft and a reverted field leaves the next conditional write", () => {
  const opened = { name: "原名称", description: "原简介" };
  const draft = { name: " 新名称 ", description: " 新简介 " };
  const submitted = conditionalGroupProfilePatch(opened, draft)!;
  const current = { name: "其他人的名称", description: "原简介" };
  const rebased = rebaseGroupProfileDraft(
    draft,
    current,
    changedProfileFields(submitted),
  );
  assert.deepEqual(rebased, draft);
  assert.deepEqual(conditionalGroupProfilePatch(current, rebased), {
    name: "新名称",
    description: "新简介",
    expected: current,
  });
  assert.deepEqual(
    conditionalGroupProfilePatch(current, {
      ...rebased,
      name: " 其他人的名称 ",
    }),
    {
      description: "新简介",
      expected: { description: "原简介" },
    },
  );
});

test("clearing a description keeps the raw empty draft and checks the newest description on reconfirmation", () => {
  const opened = { name: "保留名称", description: "旧简介" };
  const draft = { name: "保留名称", description: " \n " };
  const submitted = conditionalGroupProfilePatch(opened, draft)!;
  const current = { name: "另一个新名称", description: "新版简介" };
  const rebased = rebaseGroupProfileDraft(
    draft,
    current,
    changedProfileFields(submitted),
  );
  assert.deepEqual(rebased, { name: "另一个新名称", description: " \n " });
  assert.deepEqual(conditionalGroupProfilePatch(current, rebased), {
    description: "",
    expected: { description: "新版简介" },
  });
  const nextCurrent = { name: "另一个新名称", description: null };
  const nextDraft = rebaseGroupProfileDraft(rebased, nextCurrent, [
    "description",
  ]);
  assert.equal(conditionalGroupProfilePatch(nextCurrent, nextDraft), null);
});

test("adopting a matching server snapshot needs no write and invalid drafts retain original validation", () => {
  const current = { name: "共同名称", description: "共同简介" };
  assert.equal(
    conditionalGroupProfilePatch(current, {
      name: " 共同名称 ",
      description: "共同简介",
    }),
    null,
  );
  assert.throws(
    () =>
      conditionalGroupProfilePatch(current, {
        name: "",
        description: "共同简介",
      }),
    /不能清空/,
  );
  assert.throws(
    () =>
      conditionalGroupProfilePatch(current, {
        name: "共同名称",
        description: "介".repeat(GROUP_DESCRIPTION_MAX_LENGTH + 1),
      }),
    /群简介/,
  );
});

test("profile conflict comparison shows all submitted fields, their drafts and the atomic no-save boundary", () => {
  const markup = renderToStaticMarkup(
    createElement(GroupProfileConflictNotice, {
      conflict: {
        current: { name: "服务器名称", description: "服务器简介" },
        conflictingFields: ["name"],
        submittedFields: ["name", "description"],
      },
      draft: { name: " 我的名称 ", description: "<script>我的简介</script>" },
    }),
  );
  assert.match(markup, /群名称 · 发生冲突/);
  assert.match(markup, /群简介 · 本次未保存/);
  assert.match(markup, /未标注冲突的字段也未保存/);
  assert.match(markup, /服务器名称/);
  assert.match(markup, /服务器简介/);
  assert.match(markup, / 我的名称 /);
  assert.match(markup, /&lt;script&gt;我的简介&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
});

test("profile conflict comparison distinguishes an empty server description from the draft clear intent", () => {
  const markup = renderToStaticMarkup(
    createElement(GroupProfileConflictNotice, {
      conflict: {
        current: { name: "名称", description: null },
        conflictingFields: ["description"],
        submittedFields: ["description"],
      },
      draft: { name: "名称", description: " \n " },
    }),
  );
  assert.match(markup, /未填写/);
  assert.match(markup, /清空简介/);
});

test("group responses require real metadata fields and a valid UTC creation timestamp", () => {
  assert.deepEqual(groupSchema.parse(group), group);
  for (const field of ["name", "description", "createdAt"] as const) {
    const incomplete: Record<string, unknown> = { ...group };
    delete incomplete[field];
    assert.equal(groupSchema.safeParse(incomplete).success, false, field);
  }
  for (const invalid of [
    { name: "" },
    { name: "  " },
    { name: 123 },
    { name: "名称 " },
    { description: "" },
    { description: false },
    { createdAt: null },
    { createdAt: "2026-09-30" },
    { createdAt: "invalid" },
  ])
    assert.equal(
      groupSchema.safeParse({ ...group, ...invalid }).success,
      false,
    );
});

test("group profile shows the server date and read-only content without a viewer edit entry", () => {
  const viewer = renderToStaticMarkup(
    createElement(GroupProfile, { group, canEdit: false, onEdit() {} }),
  );
  assert.match(viewer, /未填写/);
  assert.match(viewer, /dateTime="2026-09-30T11:00:00.000Z"/);
  assert.match(viewer, />2026\//);
  assert.doesNotMatch(viewer, /<button|<input|<textarea/);
  const admin = renderToStaticMarkup(
    createElement(GroupProfile, {
      group: { ...group, description: "发布计划\n<script>文本</script>" },
      canEdit: true,
      onEdit() {},
    }),
  );
  assert.match(admin, /编辑资料/);
  assert.match(admin, /发布计划\n&lt;script&gt;文本&lt;\/script&gt;/);
});

test("group choices retain gateway identity when human names collide", () => {
  assert.equal(groupOptionLabel(group), "gateway-group");
  assert.equal(
    groupOptionLabel({ ...group, name: "同名群" }),
    "同名群 · gateway-group",
  );
  assert.notEqual(
    groupOptionLabel({ ...group, name: "同名群" }),
    groupOptionLabel({
      ...group,
      name: "同名群",
      gatewayGroupId: "other-gateway",
    }),
  );
});
