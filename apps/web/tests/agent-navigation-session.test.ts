import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  activateAgentNavigationSession,
  clearAgentNavigationSession,
  getAgentNavigationContext,
} from "../src/state/agentNavigationSession";
import {
  agentDetailHref,
  agentListHref,
  parseRoute,
} from "../src/hooks/useRoute";
const admin = { username: "admin", role: "admin" };
const originalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "sessionStorage",
);
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    },
  });
  clearAgentNavigationSession();
});
afterEach(() => {
  clearAgentNavigationSession();
  if (originalStorage)
    Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});

test("confirmed same-login refresh restores context but explicit login always rotates it", () => {
  activateAgentNavigationSession(admin, false);
  const original = getAgentNavigationContext();
  assert(original);
  const url = agentDetailHref("r", "groups", "g");
  activateAgentNavigationSession(admin, true);
  assert.equal(getAgentNavigationContext(), original);
  assert.equal(parseRoute(url).agentOrigin, "groups");
  activateAgentNavigationSession(admin, false);
  assert.notEqual(getAgentNavigationContext(), original);
  assert.equal(parseRoute(url).agentOrigin, null);
});

test("identity mismatch and explicit expiry cannot revive old history origins or list filters", () => {
  activateAgentNavigationSession(admin, false);
  const detail = agentDetailHref("r", "groups", "g");
  const list = agentListHref("g");
  activateAgentNavigationSession({ username: "viewer", role: "viewer" }, true);
  assert.equal(parseRoute(detail).agentOrigin, null);
  assert.equal(parseRoute(list).agentGroup, null);
  clearAgentNavigationSession();
  assert.equal(getAgentNavigationContext(), null);
  assert.equal(values.size, 0);
  activateAgentNavigationSession(admin, true);
  assert.equal(parseRoute(detail).agentOrigin, null);
});

test("unavailable or malformed storage fails closed without failing authentication", () => {
  values.set("kapibala:agentNavigationSession", "not JSON");
  assert.doesNotThrow(() => activateAgentNavigationSession(admin, true));
  assert.equal(getAgentNavigationContext(), null);
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get: () => {
      throw new DOMException("blocked", "SecurityError");
    },
  });
  assert.doesNotThrow(() => clearAgentNavigationSession());
  assert.doesNotThrow(() => activateAgentNavigationSession(admin, false));
  assert.equal(getAgentNavigationContext(), null);
  assert.equal(agentDetailHref("r", "groups", "g"), "#/agent-runs/r");
});
