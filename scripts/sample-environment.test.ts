import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { test, type TestContext } from "node:test";
import { prepareSample, type SampleOptions } from "./sample-environment.js";

async function fixture(
  t: TestContext,
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<SampleOptions & { stages: string[]; controller: AbortController }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const stages: string[] = [];
  const controller = new AbortController();
  return {
    urls: { api: origin, web: origin, gateway: origin, agent: origin },
    revision: null,
    signal: controller.signal,
    controller,
    stages,
    onProgress(stage) {
      stages.push(stage);
    },
  };
}
function respond(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

test("sample refuses a populated environment before any data mutation", async (t) => {
  const calls: string[] = [];
  const options = await fixture(t, (request, response) => {
    calls.push(`${request.method} ${request.url}`);
    respond(
      response,
      request.url === "/api/auth/login"
        ? { accessToken: "test-token" }
        : [{ id: "existing-group" }],
    );
  });
  await assert.rejects(
    prepareSample(options),
    /empty-environment.*requires an empty environment/,
  );
  assert.deepEqual(calls, ["POST /api/auth/login", "GET /api/groups"]);
  assert.deepEqual(options.stages, ["empty-environment"]);
});

test("sample HTTP failure reports its stage and is not retried", async (t) => {
  let requests = 0;
  const options = await fixture(t, (_request, response) => {
    requests++;
    respond(response, { code: "AUTH_UNAVAILABLE" }, 503);
  });
  await assert.rejects(prepareSample(options), /empty-environment.*HTTP 503/);
  assert.equal(requests, 1);
});

for (const failure of ["failed", "uncertain", "interrupted"] as const) {
  test(
    `sample stops on ${failure} create job without replaying the write`,
    { timeout: 5000 },
    async (t) => {
      const calls: string[] = [];
      const options = await fixture(t, (request, response) => {
        calls.push(`${request.method} ${request.url}`);
        if (request.url === "/api/auth/login")
          return respond(response, { accessToken: "test-token" });
        if (
          request.method === "GET" &&
          ["/api/groups", "/api/sequences"].includes(request.url!)
        )
          return respond(response, []);
        if (request.url === "/api/accounts")
          return respond(
            response,
            Array.from({ length: 6 }, (_, i) => ({
              id: `account-${i + 1}`,
              status: "idle",
            })),
          );
        if (request.url?.endsWith("/connect"))
          return respond(response, { status: "online" });
        if (request.method === "POST" && request.url === "/api/groups")
          return respond(response, { jobId: "sample-job" }, 202);
        assert.equal(request.url, "/api/jobs/sample-job");
        if (failure === "interrupted") {
          // A hanging poll must be cancelled immediately, not wait for its 10s
          // request or 30s stage deadline. A write must never be retried.
          options.controller.abort(new Error("test stop signal"));
          return;
        }
        respond(response, {
          id: "sample-job",
          status: failure === "failed" ? "failed" : "running",
          errors:
            failure === "failed" ? [{ step: "create", code: "FAILED" }] : [],
          recoveryNote:
            failure === "uncertain" ? "remote result unknown" : null,
          processing: failure === "uncertain",
          groupId: null,
        });
      });
      await assert.rejects(prepareSample(options), /directory-group-1\/17/);
      assert.equal(
        calls.filter((call) => call === "POST /api/groups").length,
        1,
      );
      assert.equal(
        calls.filter((call) => call === "GET /api/jobs/sample-job").length,
        1,
      );
      assert.equal(options.stages.at(-1), "directory-group-1/17");
    },
  );
}
