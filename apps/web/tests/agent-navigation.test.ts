import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentDetailHref,
  agentListHref,
  agentReturnLink,
  parseRoute,
} from "../src/hooks/useRoute";
const context = "this-login-context";

test("Agent detail carries only a whitelisted origin and leaves identifiers intact", () => {
  for (const origin of ["groups", "agent-runs"] as const) {
    const route = parseRoute(
      agentDetailHref("run/含?&#", origin, undefined, context),
      context,
    );
    assert.equal(route.id, "run/含?&#");
    assert.equal(route.agentOrigin, origin);
    assert.equal(route.agentGroup, null);
  }
  assert.equal(parseRoute("#/groups/g?from=agent-runs").agentOrigin, null);
  assert.equal(
    parseRoute("#/agent-runs/r?from=https://example.com").agentOrigin,
    null,
  );
  assert.equal(
    parseRoute("#/agent-runs/r?from=//example.com").agentOrigin,
    null,
  );
});

test("Agent list selection survives internal return with reserved characters", () => {
  const back = agentReturnLink("agent-runs", "group/含?&#", context);
  assert.equal(parseRoute(back.href, context).agentGroup, "group/含?&#");
  assert.equal(parseRoute(back.href).id, null);
  assert.equal(back.href, agentListHref("group/含?&#", context));
  const pending = parseRoute(
    agentDetailHref("r", "agent-runs", "group/含?&#", context),
    context,
  );
  assert.equal(pending.agentGroup, "group/含?&#");
  assert.equal(
    agentReturnLink(pending.agentOrigin, pending.agentGroup!, context).href,
    back.href,
  );
});

test("old or missing login contexts discard both detail origin and list selection", () => {
  const detail = agentDetailHref("r", "groups", "g", "old-login");
  const list = agentListHref("g", "old-login");
  for (const current of ["new-login", null]) {
    assert.equal(parseRoute(detail, current).id, "r");
    assert.equal(parseRoute(detail, current).agentOrigin, null);
    assert.equal(parseRoute(detail, current).agentGroup, null);
    assert.equal(parseRoute(list, current).agentGroup, null);
  }
  assert.equal(
    parseRoute("#/agent-runs/r?from=groups&group=g", context).agentOrigin,
    null,
  );
  assert.equal(agentDetailHref("r", "groups", "g", null), "#/agent-runs/r");
  assert.equal(agentListHref("g", null), "#/agent-runs");
});

test("group-origin return and direct links have internal loading/failure fallbacks", () => {
  assert.deepEqual(agentReturnLink("groups"), {
    href: "#/groups",
    label: "返回群组工作台",
  });
  assert.equal(agentReturnLink("groups", "g/id").href, "#/groups/g%2Fid");
  assert.equal(agentReturnLink(null, "g").href, "#/agent-runs");
  assert.equal(agentReturnLink("agent-runs").href, "#/agent-runs");
});

test("malformed deep-link encoding falls back without throwing or copying an external return URL", () => {
  const route = parseRoute(
    "#/agent-runs/%E0%A4?from=groups&returnTo=https://example.com",
  );
  assert.equal(route.page, "agent-runs");
  assert.equal(route.id, null);
  assert.equal(route.agentOrigin, null);
  assert.equal(
    parseRoute("#/agent-runs/r?returnTo=javascript:alert(1)").agentOrigin,
    null,
  );
});
