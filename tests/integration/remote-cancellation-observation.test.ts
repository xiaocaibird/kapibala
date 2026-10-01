import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import { test, type TestContext } from "node:test";
import { withOperationSignal } from "../../apps/server/src/core/db.js";
import { RemoteError } from "../../apps/server/src/core/errors.js";
import {
  RemoteClient,
  type RemoteObservation,
} from "../../apps/server/src/core/remote.js";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture(t: TestContext) {
  const received = deferred<ServerResponse>();
  const server = createServer((_request, response) =>
    received.resolve(response),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    remote: new RemoteClient(`http://127.0.0.1:${address.port}`),
    received,
  };
}

function recordFacts() {
  const facts: RemoteObservation[] = [];
  return {
    facts,
    record: (fact: RemoteObservation) => {
      facts.push(fact);
    },
  };
}

function verifyRequest(facts: RemoteObservation[]) {
  assert.equal(facts[0]?.stage, "dispatch");
  assert.equal(facts.at(-1)?.stage, "request-settled");
  assert.equal(new Set(facts.map((fact) => fact.requestId)).size, 1);
  assert.ok(facts[0]!.requestId.length > 0);
  for (let index = 1; index < facts.length; index++)
    assert.ok(
      BigInt(facts[index]!.observedAtMonoNs) >=
        BigInt(facts[index - 1]!.observedAtMonoNs),
    );
}

test(
  "remote observes the real activity signal while HTTP headers are pending and cleans listeners",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    const { facts, record } = recordFacts();
    const budget = AbortSignal.timeout(200);
    const initialListeners = getEventListeners(budget, "abort").length;
    const request = f.remote.request(
      "/private-path",
      undefined,
      4000,
      budget,
      undefined,
      record,
      [{ source: "activity-budget", signal: budget }],
    );
    const rejection = assert.rejects(
      request,
      (error) => error === budget.reason,
    );
    await f.received.promise;
    await rejection;
    verifyRequest(facts);
    const source = facts.find(
      (fact) =>
        fact.stage === "source-aborted" && fact.source === "activity-budget",
    );
    assert.equal(source?.fetchPending, true);
    assert.equal(source?.bodyPending, false);
    const combined = facts.find((fact) => fact.stage === "combined-aborted");
    assert.ok(combined?.abortedSources.includes("activity-budget"));
    assert.ok(combined?.reasonMatchedSources.includes("activity-budget"));
    assert.equal(
      facts.find((fact) => fact.stage === "fetch-settled")?.outcome,
      "rejected",
    );
    assert.equal(facts.at(-1)?.outcome, "rejected");
    assert.equal(getEventListeners(budget, "abort").length, initialListeners);
    assert.ok(!JSON.stringify(facts).includes("private-path"));
  },
);

test(
  "request deadline is observed independently of an untriggered activity signal",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    const { facts, record } = recordFacts();
    const budget = new AbortController();
    const request = f.remote.request(
      "/deadline",
      undefined,
      100,
      budget.signal,
      undefined,
      record,
      [{ source: "activity-budget", signal: budget.signal }],
    );
    const rejection = assert.rejects(request);
    await f.received.promise;
    await rejection;
    verifyRequest(facts);
    assert.equal(budget.signal.aborted, false);
    assert.deepEqual(
      facts
        .filter((fact) => fact.stage === "source-aborted")
        .map((fact) => fact.source),
      ["request-deadline"],
    );
    assert.deepEqual(facts.at(-1)?.abortedSources, ["request-deadline"]);
    assert.equal(getEventListeners(budget.signal, "abort").length, 0);
  },
);

test(
  "activity cancellation after headers records the real body rejection",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    const { facts, record } = recordFacts();
    const budget = new AbortController();
    const headers = deferred();
    const request = f.remote.request(
      "/body",
      undefined,
      4000,
      budget.signal,
      undefined,
      (fact) => {
        record(fact);
        if (fact.stage === "response-headers") headers.resolve();
      },
      [{ source: "activity-budget", signal: budget.signal }],
    );
    const rejection = assert.rejects(request);
    const response = await f.received.promise;
    response.writeHead(200, { "content-type": "application/json" });
    response.write("{");
    await headers.promise;
    budget.abort(new Error("sensitive-reason-must-not-be-recorded"));
    await rejection;
    verifyRequest(facts);
    const source = facts.find(
      (fact) =>
        fact.stage === "source-aborted" && fact.source === "activity-budget",
    );
    assert.equal(source?.fetchPending, false);
    assert.equal(source?.bodyPending, true);
    assert.equal(
      facts.find((fact) => fact.stage === "fetch-settled")?.outcome,
      "fulfilled",
    );
    assert.equal(
      facts.find((fact) => fact.stage === "body-settled")?.outcome,
      "rejected",
    );
    assert.ok(!JSON.stringify(facts).includes("sensitive-reason"));
  },
);

test(
  "actual connection failure does not invent an abort source",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    const { facts, record } = recordFacts();
    const request = f.remote.request(
      "/disconnect",
      undefined,
      4000,
      undefined,
      undefined,
      record,
    );
    const rejection = assert.rejects(request);
    const response = await f.received.promise;
    response.destroy();
    await rejection;
    verifyRequest(facts);
    assert.deepEqual(facts.at(-1)?.abortedSources, []);
    assert.equal(
      facts.some(
        (fact) =>
          fact.stage === "source-aborted" || fact.stage === "combined-aborted",
      ),
      false,
    );
    assert.equal(facts.at(-1)?.transportCode, "UND_ERR_SOCKET");
  },
);

test(
  "simultaneous operation and activity signals retain both observations and actual reason matches",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t);
    const { facts, record } = recordFacts();
    const budget = new AbortController();
    const operation = new AbortController();
    const operationReason = new Error("operation-secret");
    const budgetReason = new Error("budget-secret");
    let actualReason: unknown;
    budget.signal.addEventListener(
      "abort",
      () => operation.abort(operationReason),
      { once: true },
    );
    const request = withOperationSignal(operation.signal, () =>
      f.remote.request(
        "/multi",
        undefined,
        4000,
        budget.signal,
        undefined,
        record,
        [{ source: "activity-budget", signal: budget.signal }],
      ),
    );
    const rejection = assert.rejects(request, (error) => {
      actualReason = error;
      return error === operationReason || error === budgetReason;
    });
    await f.received.promise;
    budget.abort(budgetReason);
    await rejection;
    verifyRequest(facts);
    assert.deepEqual(facts.at(-1)?.abortedSources, [
      "operation",
      "caller",
      "activity-budget",
    ]);
    assert.deepEqual(
      facts.at(-1)?.reasonMatchedSources,
      actualReason === operationReason
        ? ["operation"]
        : ["caller", "activity-budget"],
    );
    assert.ok(facts.some((fact) => fact.source === "activity-budget"));
    assert.ok(facts.some((fact) => fact.source === "operation"));
    assert.equal(getEventListeners(operation.signal, "abort").length, 0);
    assert.equal(getEventListeners(budget.signal, "abort").length, 0);
    assert.ok(!JSON.stringify(facts).includes("secret"));
  },
);

test(
  "observer exceptions preserve success and actual HTTP failure; completed listeners are removed",
  { timeout: 5000 },
  async (t) => {
    for (const status of [200, 504]) {
      const f = await fixture(t);
      const caller = new AbortController();
      let records = 0;
      const request = f.remote.request(
        "/safe",
        { text: "private-body" },
        4000,
        caller.signal,
        undefined,
        () => {
          records++;
          throw new Error("observer failed");
        },
      );
      const result =
        status === 504
          ? assert.rejects(
              request,
              (error) => error instanceof RemoteError && error.status === 504,
            )
          : request;
      const response = await f.received.promise;
      response.writeHead(status, { "content-type": "application/json" });
      response.end(
        status === 200 ? '{"ok":true}' : '{"code":"NETWORK_TIMEOUT"}',
      );
      if (status === 200) assert.deepEqual(await result, { ok: true });
      else await result;
      assert.ok(records > 0);
      assert.equal(getEventListeners(caller.signal, "abort").length, 0);
      const settledRecords = records;
      caller.abort();
      assert.equal(records, settledRecords);
    }
  },
);

test(
  "observer disabled installs no source listeners and a throwing abort observer cannot replace cancellation",
  { timeout: 5000 },
  async (t) => {
    for (const observed of [false, true]) {
      const f = await fixture(t);
      const caller = new AbortController();
      const reason = new Error("actual cancellation");
      const request = f.remote.request(
        "/listener",
        undefined,
        4000,
        caller.signal,
        undefined,
        observed
          ? () => {
              throw new Error("observer failed");
            }
          : undefined,
      );
      const rejection = assert.rejects(request, (error) => error === reason);
      await f.received.promise;
      assert.equal(
        getEventListeners(caller.signal, "abort").length,
        observed ? 1 : 0,
      );
      caller.abort(reason);
      await rejection;
      assert.equal(getEventListeners(caller.signal, "abort").length, 0);
    }
  },
);
