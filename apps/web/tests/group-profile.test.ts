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
  createGroupProfile,
  groupOptionLabel,
} from "../src/api/groupProfile";
import { groupSchema, type Group } from "../src/api/schemas";
import { GroupProfile } from "../src/components/GroupProfile";

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
